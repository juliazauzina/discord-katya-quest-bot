import User from "../../Models/User";
import QuestionsDAO from "../../DAO/QuestionsDAO";
import AppServiceContainer from "../../AppServiceContainer";
import Question from "../../Models/Question";
import UsersDAO from "../../DAO/UsersDAO";
import CheckAnswerResult from "../../DTO/CheckAnswerResult";
import AnswerAttempt from "../../Models/AnswerAttempt";
import AnswerAttemptsDAO from "../../DAO/AnswerAttemptsDAO";
import NotificationService from "../NotificationService/NotificationService";
import {HintService} from "./HintService";

export default class GameService {
    questionsTotal: number = 11;

    questionsDao: QuestionsDAO = new QuestionsDAO(AppServiceContainer.db);
    userDao: UsersDAO = new UsersDAO(AppServiceContainer.db);
    answerAttemptDao: AnswerAttemptsDAO = new AnswerAttemptsDAO(AppServiceContainer.db);
    notificationService: NotificationService = new NotificationService();
    hintService: HintService = new HintService();

    public async getCurrentQuestion(user: User): Promise<Question>
    {
        return await this.questionsDao.get(user.level);
    }

    public async checkAnswer(user: User, question: Question, answer: string): Promise<CheckAnswerResult>
    {
        let dto = new CheckAnswerResult();
        dto.isCorrect = question.getAnswers().some((v) => v.toLowerCase() === answer.toLowerCase());

        let answerAttempt = new AnswerAttempt();
        answerAttempt.user_id = user.id;
        answerAttempt.given_at = Math.floor(Date.now() / 1000);
        answerAttempt.level = user.level;
        answerAttempt.is_correct = dto.isCorrect;
        answerAttempt.answer = answer;
        await this.answerAttemptDao.save(answerAttempt);

        if (dto.isCorrect) {
            dto.message = question.complete_text;

            let answersCount = await this.answerAttemptDao.getCorrectAnswersCount(user.level);
            if (answersCount < 4 && user.level <= this.questionsTotal - 1) {
                await this.notificationService.broadcastLevelup(user, answersCount);
            }

            await this.userDao.advanceLevel(user);
        }

        return dto;
    }

    public async isActivePlayer(user: User): Promise<boolean>
    {
        let question = await this.getCurrentQuestion(user);
        return !!question;
    }

    private async isGameHasThreeWinners(): Promise<boolean>
    {
        let answerCount = await this.answerAttemptDao.getCorrectAnswersCount(this.questionsTotal);
        return answerCount >= 3;
    }

    async doHint(user: User, question: Question): Promise<string>
    {
        if (await this.isGameHasThreeWinners()) {
            return null;
        }

        return this.hintService.doHint(user, question);
    }

    async completeGame(user: User): Promise<void>
    {
        let currentTime = Math.ceil(Date.now() / 1000);
        user.time_to_complete = currentTime - user.started_at + await this.hintService.getTotalPenalty(user);
        await this.userDao.save(user);

        let playersCompletedGame = await this.answerAttemptDao.getCorrectAnswersCount(this.questionsTotal);

        if (playersCompletedGame < 4) {
            await this.notificationService.broadcastWin(user, playersCompletedGame);
        }
    }
}