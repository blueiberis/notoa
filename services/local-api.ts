// services/local-api.ts
import express from 'express';
import { handler as notes } from './notes/handler';
import { handler as upload } from './upload/handler';

const app = express();
app.use(express.json());

app.get("/notes", (req, res) => notes({ httpMethod: "GET" }).then(r => res.json(JSON.parse(r.body))));
app.post("/notes", (req, res) => notes({ httpMethod: "POST", body: JSON.stringify(req.body) }).then(r => res.json(JSON.parse(r.body))));
app.post("/upload", (req, res) => upload({ httpMethod: "POST", body: JSON.stringify(req.body) }).then(r => res.json(JSON.parse(r.body))));

app.listen(3001, () => console.log("API running on port 3001"));