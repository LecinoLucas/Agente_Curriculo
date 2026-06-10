const { execSync } = require('child_process');

const EXPECTED_ROOT = '/Users/lecinolucas/Developer/Agente_Curriculo';

try {
  const actualRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  
  if (actualRoot !== EXPECTED_ROOT) {
    console.error('\x1b[31m%s\x1b[0m', 'REPOSITÓRIO ERRADO — operação bloqueada.');
    console.error(`Esperado: ${EXPECTED_ROOT}`);
    console.error(`Atual:    ${actualRoot}`);
    process.exit(1);
  }
  
  console.log('\x1b[32m%s\x1b[0m', 'Repositório correto confirmado.');
} catch (error) {
  console.error('\x1b[31m%s\x1b[0m', 'Erro ao validar o root do repositório:');
  console.error(error.message);
  process.exit(1);
}
