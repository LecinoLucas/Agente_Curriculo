const { execSync } = require('child_process');

const port = process.argv[2];
const label = process.argv[3] || 'dev-server';
const EXPECTED_REPO = '/Users/lecinolucas/Developer/Agente_Curriculo';

if (!port) {
  console.error('[dev-port] Erro: Porta não especificada.');
  process.exit(1);
}

function getProcessInfo(port) {
  try {
    // lsof -ti TCP:port retorna apenas o PID
    const pid = execSync(`lsof -ti TCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    if (!pid) return null;

    // ps -p PID -o command= retorna o comando completo
    const command = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8' }).trim();
    return { pid: parseInt(pid, 10), command };
  } catch (e) {
    return null;
  }
}

function isSafeToKill(info) {
  const cmd = info.command.toLowerCase();
  const hasNode = cmd.includes('node');
  const hasVite = cmd.includes('vite');
  const inRepo = info.command.includes(EXPECTED_REPO);
  
  return (hasNode || hasVite) && inRepo;
}

const info = getProcessInfo(port);

if (!info) {
  console.log(`[dev-port] Porta ${port} (${label}) está livre.`);
  process.exit(0);
}

if (isSafeToKill(info)) {
  console.log(`[dev-port] Porta ${port} ocupada por Vite antigo do projeto. Encerrando PID ${info.pid}...`);
  try {
    process.kill(info.pid, 'SIGTERM');
    
    // Aguardar até 5 segundos
    for (let i = 0; i < 10; i++) {
      if (!getProcessInfo(port)) {
        console.log(`[dev-port] Porta ${port} liberada.`);
        process.exit(0);
      }
      execSync('sleep 0.5');
    }

    console.log(`[dev-port] PID ${info.pid} não encerrou com SIGTERM, tentando SIGKILL...`);
    process.kill(info.pid, 'SIGKILL');
    
    if (!getProcessInfo(port)) {
      console.log(`[dev-port] Porta ${port} liberada com SIGKILL.`);
      process.exit(0);
    } else {
      console.error(`[dev-port] Falha ao liberar porta ${port}.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[dev-port] Erro ao tentar matar processo: ${err.message}`);
    process.exit(1);
  }
} else {
  console.error(`[dev-port] Porta ${port} ocupada por processo externo.`);
  console.error(`[dev-port] PID: ${info.pid}`);
  console.error(`[dev-port] Comando: ${info.command}`);
  console.error(`[dev-port] Operação bloqueada para evitar matar processo errado.`);
  process.exit(1);
}
