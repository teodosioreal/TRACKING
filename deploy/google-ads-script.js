// Script do Google Ads do produto: __PRODUTO__
// Envia para o Google Ads as vendas DESTE produto e de nenhum outro.
// Cole na conta de anúncios onde este produto roda: Ferramentas → Ações em
// massa → Scripts → +, dê o nome "Tracking - __PRODUTO__", clique em Autorizar,
// Executar e deixe a Frequência em "Por hora". Cada produto tem o seu script.
var PRODUTO = '__PRODUTO__';
var PLANILHA = '__PLANILHA__';
// Para onde o script conta ao rastreador quantas vendas enviou (ou o erro).
var RELATORIO = '__RELATORIO__';

function main() {
  Logger.log('Produto: ' + PRODUTO);
  var relatorio = { enviadas: 0, porConversao: {}, erro: null, conta: conta() };
  try {
    relatorio.enviadas = enviar(relatorio.porConversao);
  } catch (e) {
    relatorio.erro = String((e && e.message) || e);
    avisar(relatorio);
    throw e;
  }
  avisar(relatorio);
}

function enviar(porConversao) {
  var resposta = UrlFetchApp.fetch(PLANILHA, { muteHttpExceptions: true });
  if (resposta.getResponseCode() !== 200) {
    throw new Error('Não consegui ler a planilha do rastreador (resposta ' + resposta.getResponseCode() + ').');
  }

  // Linha 1: Parameters:TimeZone. Linha 2: cabeçalho. Depois: uma venda por linha.
  var vendas = Utilities.parseCsv(resposta.getContentText())
    .slice(2)
    .filter(function (l) {
      return l.length >= 5 && l[0];
    });
  Logger.log(vendas.length + ' venda(s) na planilha.');
  if (!vendas.length) return 0;

  var upload = AdsApp.bulkUploads().newCsvUpload(
    ['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency'],
    { moneyInMicros: false, timeZone: '+0000' },
  );
  upload.forOfflineConversions();
  vendas.forEach(function (l) {
    upload.append({
      'Google Click ID': l[0],
      'Conversion Name': l[1],
      // A planilha traz o horário em UTC com "+0000"; o fuso vai no timeZone acima.
      'Conversion Time': l[2].replace(/[+-]\d{4}$/, ''),
      'Conversion Value': l[3],
      'Conversion Currency': l[4],
    });
    porConversao[l[1]] = (porConversao[l[1]] || 0) + 1;
  });
  upload.apply();
  Logger.log('Enviado. Resultado em Ferramentas → Ações em massa → Uploads. Vendas repetidas são ignoradas pelo Google.');
  return vendas.length;
}

function conta() {
  try {
    var c = AdsApp.currentAccount();
    return { id: c.getCustomerId(), nome: c.getName() };
  } catch (e) {
    return null;
  }
}

function avisar(relatorio) {
  try {
    UrlFetchApp.fetch(RELATORIO, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(relatorio),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('Não consegui avisar o rastreador: ' + e);
  }
}
