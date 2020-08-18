import AbstractDAO from 'nergal/src/DAO/AbstractDAO';
import { IDbAdapter } from 'nergal/src/Services/Db/IDbAdapter';
import Question from "../Models/Question";

export default class QuestionsDAO extends AbstractDAO<Question> {
    fields: string[] = ['text', 'hint', 'answers'];
    table: string = 'questions';

    public constructor(db: IDbAdapter) {
        super(db, () => new Question);
    }
}