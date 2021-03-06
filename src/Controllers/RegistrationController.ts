import {DiscordControllerResponse, DiscordMessage, EmojiReference, ReactionCollector} from "nergal";
import RegistrationData, {RegistrationStage} from "../DTO/RegistrationData";
import Guild, {availableRealms, guildByEmoji, guildsById} from "../Config/Guilds";
import UsersDAO from "../DAO/UsersDAO";
import AppServiceContainer from "../AppServiceContainer";
import User from "../Models/User";
import GameService from "../Services/Game/GameService";
import DirectMessageService from "../Services/DirectMessages/DirectMessageService";
import NotificationService from "../Services/NotificationService/NotificationService";

export default class RegistrationController {
    private userData: Map<string, RegistrationData> = new Map<string, RegistrationData>();
    private gameService: GameService = new GameService();
    private usersDao = new UsersDAO(AppServiceContainer.db);
    private directMessageService = new DirectMessageService();
    private notificationService = new NotificationService();

    public async handle(msg: DiscordMessage): Promise<DiscordControllerResponse>
    {
        if (!this.userData.has(msg.authorId)) {
            return this.startRegistration(msg);
        }

        let userData = this.userData.get(msg.authorId);
        switch (userData.stage) {
            case RegistrationStage.CHARACTER_SELECTION:
                return this.selectCharacter(userData, msg.message);
            case RegistrationStage.REALM_SELECTION:
                return this.selectRealm(userData, msg.message);
            case RegistrationStage.FACTION_SELECTION:
                return this.sendFactionChoiceRequest(userData);
            case RegistrationStage.GUILD_SELECTION:
                return this.sendGuildChoiceRequest();
        }

        return null;
    }

    private async promptCharacterSelection(): Promise<DiscordControllerResponse>
    {
        return new DiscordControllerResponse("Здравствуй, путник! Представься, пожалуйста. Укажи имя своего основного персонажа.");
    }

    private async selectCharacter(userData: RegistrationData, name: string)
    {
        userData.character_name = name;
        return this.sendGuildChoiceRequest();
    }

    private async startRegistration(msg: DiscordMessage): Promise<DiscordControllerResponse>
    {
        let registrationData = new RegistrationData();
        registrationData.stage = RegistrationStage.CHARACTER_SELECTION;
        registrationData.discord_id = msg.authorId;
        registrationData.discord_name = msg.authorName;
        registrationData.discord_avatar = msg.authorAvatarUrl;
        this.userData.set(msg.authorId, registrationData);

        return this.promptCharacterSelection();
    }

    private async sendGuildChoiceRequest(): Promise<DiscordControllerResponse>
    {
        let emojis: EmojiReference[] = [];
        guildsById.forEach(g => emojis.push(new EmojiReference('296690626244902913', g.icon)));

        let collector = new ReactionCollector();
        collector.time = 150000;
        collector.lambda = async (reaction, user) => {
            this.selectGuild(reaction.emoji.name, user.id);
        };

        return new DiscordControllerResponse("Пожалуйста, расскажи откуда ты пришел: нажми на реакцию с значком твоего классового оплота.", null, false, emojis, collector);
    }

    private async selectGuild(emojiName: string, discord_user_id: string)
    {
        let guild = guildByEmoji.get(emojiName);
        if (!guild) return;

        let userData = this.userData.get(discord_user_id);
        userData.guild = guild;
        userData.stage = RegistrationStage.REALM_SELECTION;

        this.directMessageService.sendDm(discord_user_id, "Отлично! Проведение игры требует совсем небольшой подготовки со стороны администрации. Пожалуйста, напиши название своего сервера, и мы будем готовы начать уже в течении 10 минут.\n\nК сожалению, наши ресурсы не безграничны, и мы не можем проводить игру на каждом из серверов. В случае, если твой сервер не попал в список разрешенных, просто укажи любой другой, на котором у тебя есть альт, либо же создай пробного персонажа на Гордунни (альянс), либо Свежевателе Душ (орда). Его будет достаточно для прохождения квеста.");
    }

    private async register(userData: RegistrationData, faction: string)
    {
        let user = new User();
        user.name = userData.discord_name;
        user.character_name = userData.character_name;
        user.discord_user_id = userData.discord_id;
        user.discord_guild_id = userData.guild.discord_id;
        user.realm = userData.realm;
        user.level = 1;
        user.started_at = Math.floor(Date.now() / 1000);
        user.avatar_url = userData.discord_avatar;
        user.faction = faction;

        await this.usersDao.save(user);

        this.notificationService.notify("У нас новый участник:\n**Character name**: " + user.character_name + "\n**Discord name**: " + user.name + "\n**Discord server**: " + userData.guild.name + "\n**Realm**: " + user.realm + "\n**Faction**: " + faction);
        this.directMessageService.sendDm(user.discord_user_id, "Поздравляю, вы успешно прошли регистрацию. Первый квест придет вам уже в течении минуты, а пока вы можете ознакомится с правилами:\n1) Для прохождения квеста вы можете (и должны!) пользоваться: гуглом, вовхедом, вовпрогрессом.\n2) Локации и предметы, используемые в заданиях взяты из русской локализации игры. Мы тестировали квест и на английском рилме, но в таком случае вам гарантированно потребуется подсматривать переводы на вовхеде.\n3) Ответить на все вопросы можно на русском языке. Если вы нашли ответ на другом языке - воспользуйтесь переводчиком.\n4) Не забывайте свои предыдущие ответы! Задания могут быть связаны.\n5) После того, как будут определены трое победителей – всем остальным игрокам автоматически станут доступны подсказки! Об этом бот уведомит вас.");

        setTimeout(async () => {
            let question = await this.gameService.getCurrentQuestion(user);
            await this.directMessageService.sendDm(user.discord_user_id, question.text);
        }, 60000);
    }

    private selectRealm(userData: RegistrationData, message: string): DiscordControllerResponse
    {

        if (availableRealms.indexOf(message.toLowerCase()) === -1) {
            return new DiscordControllerResponse("К сожалению, данный сервер недоступен для игры. Пожалуйста, укажи любой другой, на котором у тебя есть альт, либо же создай пробного персонажа на Гордунни (альянс), либо Свежевателе Душ (орда). Его будет достаточно для прохождения квеста.");
        }

        userData.realm = message;
        userData.stage = RegistrationStage.FACTION_SELECTION;
        return this.sendFactionChoiceRequest(userData);
    }

    private sendFactionChoiceRequest(userData: RegistrationData): DiscordControllerResponse
    {
        let collector = new ReactionCollector();
        collector.time = 150000;
        collector.lambda = async (reaction, user) => {
            this.selectFaction(userData, reaction.emoji.name === 'horde' ? 'Орда' : 'Альянс');
        };

        return new DiscordControllerResponse("Хорошо. Теперь, пожалуйста выберите фракцию, за которую вы играете.",
            null,
            false,
            [
                new EmojiReference('296690626244902913', 'alliance'),
                new EmojiReference('296690626244902913', 'horde'),
            ],
            collector
        );
    }

    private async selectFaction(userData: RegistrationData, faction: string): Promise<DiscordControllerResponse>
    {
        await this.register(userData, faction);
        this.userData.delete(userData.discord_id);
        return null;
    }
}