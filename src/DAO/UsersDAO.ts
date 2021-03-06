import {AbstractDAO} from 'nergal';
import User from "../Models/User";
import {IDbAdapter} from 'nergal';

export default class UsersDAO extends AbstractDAO<User> {
    fields: string[] = ['id', 'name', 'discord_user_id', 'discord_guild_id', 'level', 'realm', 'started_at', 'avatar_url', 'time_to_complete', 'character_name', 'faction'];
    table: string = 'users';

    public constructor(db: IDbAdapter) {
        super(db, () => new User());
    }

    public advanceLevel(user: User)
    {
        user.level += 1;
        return this.save(user);
    }

    public async getActive(): Promise<User[]>
    {
        let data = await this.db.all("SELECT * FROM users WHERE time_to_complete IS NULL");
        return data.map(u => this.populate(u));
    }
}