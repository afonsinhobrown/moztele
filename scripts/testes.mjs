// Corre os testes com node:test passando ficheiros explícitos.
// (O `node --test <pasta>` muda de comportamento entre versões do Node:
// umas descem à pasta, outras tentam executar a pasta como módulo.)
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function ficheirosTeste(dir, encontrados = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) ficheirosTeste(caminho, encontrados);
    else if (nome.endsWith(".test.mjs")) encontrados.push(caminho);
  }
  return encontrados;
}

const raiz = process.argv[2] || "tests";
const lista = ficheirosTeste(raiz);
if (!lista.length) {
  console.error(`Sem ficheiros de teste em ${raiz}.`);
  process.exit(1);
}

const r = spawnSync(process.execPath, ["--test", ...lista], { stdio: "inherit" });
process.exit(r.status ?? 1);
