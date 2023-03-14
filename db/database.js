import { Client } from "../deps.ts";

class Database {
  constructor() {
    this.connect();
  }

  async connect() {
    this.client = new Client({
      user: "mjyliwtk",
      database: "mjyliwtk",
      hostname: "kandula.db.elephantsql.com",
      password: "Ia6AxcfnabS-uBHZmikRlp1vtBidJDOF",
      port: 5432,
    });

    await this.client.connect();
  }
}

export default new Database().client;
