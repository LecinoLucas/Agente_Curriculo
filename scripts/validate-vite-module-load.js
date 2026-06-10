#!/usr/bin/env node
'use strict';

const http = require('http');

const TARGET_URL = 'http://localhost:5173/src/pages/PipelinePage.tsx';

function checkModuleLoad() {
  return new Promise(function (resolve, reject) {
    const req = http.get(TARGET_URL, function (res) {
      const status = res.statusCode;
      const contentType = res.headers['content-type'] || '';

      res.resume();

      if (status !== 200) {
        reject(new Error('Status ' + status + ' para ' + TARGET_URL));
        return;
      }

      if (!contentType.includes('javascript')) {
        reject(new Error(
          'MIME incorreto: esperado text/javascript, recebido "' + contentType + '"\n' +
          'URL: ' + TARGET_URL + '\n' +
          'Causa provavel: Vite nao inicializou o pipeline de modulos, ou cache corrompido.\n' +
          'Solucao: cd frontend && npm run dev:clean'
        ));
        return;
      }

      resolve({ status: status, contentType: contentType });
    });

    req.on('error', function (err) {
      reject(new Error(
        'Falha ao conectar em ' + TARGET_URL + ': ' + err.message + '\n' +
        'Verifique se o Vite dev server esta rodando em http://localhost:5173'
      ));
    });

    req.end();
  });
}

checkModuleLoad()
  .then(function (result) {
    console.log('[ok] ' + TARGET_URL + ' → ' + result.status + ' ' + result.contentType);
    process.exit(0);
  })
  .catch(function (err) {
    console.error('[FAIL] validate-vite-module-load');
    console.error(err.message);
    process.exit(1);
  });
