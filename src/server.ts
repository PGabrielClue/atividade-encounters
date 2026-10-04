/**
 * ============================================================
 * Mini-Prontuario - Servidor HTTP
 * ============================================================
 * Esta semana o servidor e PROPOSITALMENTE simples:
 * um unico arquivo, sem camadas, sem arquitetura.
 * O objetivo e enxergar o HTTP acontecendo.
 *
 * A separacao em camadas chega na Semana 03. Ate la, o que
 * queremos e que voce saiba exatamente o que cada linha faz.
 */
import express from "express"; // express() --> essa função cria um objeto de aplicação Express.
import {db} from "./database";

const app = express(); // Cria uma aplicação/servidor Express e guarda esse servidor na variável app
const PORT = 3000; // a porta onde seu servidor vai ficar acessível.

// ------------------------------------------------------------
// MIDDLEWARES - executam ANTES das rotas, em ordem
// ------------------------------------------------------------

// Le o corpo da requisicao quando o Content-Type e application/json
// e coloca o resultado em req.body.
// SEM ESTA LINHA, req.body vem `undefined`. Erro numero 1 da turma.
app.use(express.json()); //Basicamente: Servidor app, use esse middleware para entender JSON

// Serve os arquivos de public/ como conteudo estatico.
// Por isso o frontend e a API vivem na MESMA origem (localhost:3000)
// e nao precisamos falar de CORS ainda.
app.use(express.static("public"));

// ------------------------------------------------------------
// ROTAS
// ------------------------------------------------------------

/** Rota de saude: serve para saber se o servidor esta de pe. */
app.get("/api/health", (_request, response) => { // Servidor app, quando chegar uma requisição GET nesse endereço, faça isso.
  response.json({ status: "ok" });
});

// ============================================================
// TODO 1 (Encontro 2, Pratica 1)
// GET /api/patients  ->  200 com um ARRAY de pacientes.
// Comece devolvendo um array fixo, escrito na mao. Sem banco ainda.
// ============================================================
// app.get("/api/patients/:id", (_request, response) => {
//   response.ok()
// });
app.get("/api/patients", (_request, response) => {
  const rows = db.prepare(
    `
      SELECT id, name, birth_date, national_id, active
      FROM patients
      ORDER BY id ASC
    `).all() as PatientRow[];

  response.status(200).json(rows.map(toPatientJson));
})
// ============================================================
// TODO 2 (Encontro 2, Pratica 2)
// POST /api/patients
//   - leia req.body
//   - valide: name obrigatorio (texto nao vazio)
//              birthDate obrigatorio no formato AAAA-MM-DD
//              nationalId obrigatorio
//   - se invalido:  400  { "error": "mensagem util" }
//   - se valido:    201  com o paciente criado
// ============================================================

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(value: unknown): boolean {
  return typeof value != "string" || value.trim() === '';
}

function validatePatientInput(body: any): string | null {
  if (isBlank(body?.name)) {
    return "O campo 'name' é obrigatorio.";
  }
  if (isBlank(body?.birthDate) || !ISO_DATE.test(body.birthDate)) {
    return "O campo 'birthDate' deve ser AAAA-MM-DD.";
  }
  if (isBlank(body?.nationalId)) {
    return "O campo 'nationalId' é obrigatorio.";
  }
  return null;
}

app.post("/api/patients", (request, response) => {
  const erro = validatePatientInput(request.body);

  if (erro) {
    return response.status(400).json({ error: erro });
  }

  const { name, birthDate, nationalId } = request.body;

  const result = db.prepare(`
    INSERT INTO patients (name, birth_date, national_id)
    VALUES (?, ?, ?)
  `).run(name, birthDate, nationalId);

  const novoPaciente = db.prepare(`
    SELECT id, name, birth_date, national_id, active
    FROM patients
    WHERE id = ?
  `).get(result.lastInsertRowid) as PatientRow;

  return response.status(201).json(toPatientJson(novoPaciente));
});
// ============================================================
// TODO 3 (Encontro 2, Pratica 3)
// Troque o array em memoria pelo banco:
//   import { db } from "./database";
//   const rows = db.prepare("SELECT ... FROM patients ORDER BY name").all();
// E crie GET /api/patients/:id devolvendo 404 quando nao existir.
// ============================================================
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function validateEncounterInput(body: any): string | null {
  // if (isBlank(body?.patientId)) {
  //   return "O campo 'patientId' é obrigatorio.";
  // }
  if (isBlank(body?.startedAt) || !DATE_TIME.test(body.startedAt)) {
    return "O campo 'startedAt' deve ser AAAA-MM-DDTHH:MM.";
  }
  if (isBlank(body?.chiefComplaint)) {
    return "O campo 'chiefComplaint' é obrigatorio.";
  }
  return null;
}

type PatientRow = { // como vem do banco
id: number;
name: string;
birth_date: string;
national_id: string;
active: number; // SQLite nao tem boolean
};

type EncounterRow = { // como vem do banco
id: number;
patient_id: number;
started_at: string;
chief_complaint: string;
notes: string | null;
};

function toPatientJson(row: PatientRow) {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    nationalId: row.national_id,
    active: row.active === 1, // 0/1 vira true/false
  };
}

function toEncounterJson(row: EncounterRow) {
  return {
    id: row.id,
    patientId: row.patient_id,
    startedAt: row.started_at,
    chiefComplaint: row.chief_complaint,
    notes: row.notes
  };
}

app.get("/api/patients/:id", (_request, response) => {
  const row = db.prepare("SELECT * FROM patients WHERE id = ?").get(_request.params.id) as PatientRow | undefined;
  if (!row) {
    return response.status(404).json({ error: "Paciente não encontrado" });
  }
  return response.json(toPatientJson(row));
})
// ------------------------------------------------------------
app.listen(PORT, () => { // Servidor app, comece a escutar requisições nessa porta
  console.log(`Mini-Prontuario no ar em http://localhost:${PORT}`);
});

// ------------------------
app.get("/api/patients/:id/encounters", (_request, response) => {
  const row = db.prepare("SELECT * FROM patients WHERE id = ?").get(_request.params.id) as PatientRow | undefined;

  if (!row) {
    return response.status(404).json({ error: "Paciente não encontrado" });
  }

  const encounterRows = db.prepare("SELECT * FROM encounters WHERE patient_id = ?").all(_request.params.id) as EncounterRow[];
  const encounters = encounterRows.map(r => toEncounterJson(r));
  return response.json(encounters);
})

//------------------------
app.post("/api/patients/:id/encounters", (_request, response) => {
  const row = db.prepare("SELECT * FROM patients WHERE id = ?").get(_request.params.id) as PatientRow | undefined;
  if (!row) {
    return response.status(404).json({ error: "Paciente não encontrado" });
  }

  const erro = validateEncounterInput(_request.body);
  if (erro) {
    return response.status(400).json({error: erro})
  }
  const newEncounter = db.prepare("INSERT INTO encounters (patient_id, started_at, chief_complaint, notes) VALUES (?, ?, ?, ?)").run(_request.params.id, _request.body.startedAt,
  _request.body.chiefComplaint,
    _request.body.notes);

  const objetoCriado = db.prepare("SELECT * FROM encounters WHERE id = ?").get(newEncounter.lastInsertRowid) as EncounterRow;

  return response.status(201).json(toEncounterJson(objetoCriado));
})
