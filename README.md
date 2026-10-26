# Tracking (Google Ads + BuyGoods)

Ferramenta de uso próprio para rastrear campanhas de review:

```
Anúncio Google ──► Página de review (?gclid=...)
                     │  t.js registra a visita e gera um ID
                     ▼
            Link da BuyGoods ganha &subid=<ID>
                     ▼
            Venda → BuyGoods chama /postback com o subid
                     ▼
            /google-ads.csv lista a venda com o gclid
                     ▼
            Google Ads importa a planilha sozinho (programação HTTPS)
```

Node puro + SQLite embutido. **Zero dependências** (não precisa de `npm install`).
Requer **Node 22.13 ou mais novo**.

## Rodar na VPS (junto com o CRM, mas separado)

O rastreador roda na mesma VPS do CRM, num subdomínio próprio
(`tracking.odingdong.tech`), com pasta, serviço e porta (3100) só dele.
Não toca em nada do CRM.

**DNS:** crie um registro **A** `tracking` apontando para o IP da VPS.

```bash
# 1. Node 22.13+ (confira com: node -v)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs

# 2. Código
sudo git clone https://github.com/teodosioreal/tracking /opt/tracking
cd /opt/tracking
sudo cp .env.example .env && sudo nano .env      # senha, SECRET_KEY, PUBLIC_URL...
sudo mkdir -p dados && sudo chown -R www-data dados

# 3. Serviço (sobe sozinho e reinicia se cair)
sudo cp deploy/tracking.service /etc/systemd/system/
sudo systemctl enable --now tracking
sudo journalctl -u tracking -f                   # logs (cada postback aparece aqui)
```

**4. HTTPS** — use o mesmo servidor web que o CRM já usa (só um pode
ocupar as portas 80/443):

- **Nginx:** `deploy/nginx-tracking.conf` (instruções dentro do arquivo,
  HTTPS via certbot).
- **Caddy:** acrescente o bloco de `deploy/Caddyfile` ao Caddyfile
  existente e rode `sudo systemctl reload caddy`.
- Se a porta 3100 já estiver em uso, troque `PORT` no `.env` e no proxy.

Teste: `https://tracking.odingdong.tech/saude` deve responder `ok`.

Atualizar depois: `cd /opt/tracking && sudo git pull && sudo systemctl restart tracking`.

**Backup:** o banco inteiro é a pasta `dados/`. Copie ela com frequência.

## Configurar

Abra `https://tracking.odingdong.tech/configurar` (login do `.env`). A página mostra
tudo pronto para copiar:

1. **Script da página de review** — `<script src=".../t.js" async></script>`.
   Todo link que aponta para `buygoods` recebe `subid=ID_DA_VISITA`. Para um
   link de outro domínio, coloque `data-rastrear` no `<a>`.
2. **Sufixo do URL final no Google Ads** (nível da conta), com a
   codificação automática (gclid) ativada:
   `campaignid={campaignid}&adgroupid={adgroupid}&keyword={keyword}&matchtype={matchtype}&device={device}&network={network}`
3. **Postback na BuyGoods** (Postback Pixels, vale para todas as ofertas):
   `.../postback?key=CHAVE&subid={SUBID}&order={ORDERID}&amount={COMMISSION_AMOUNT}&type={CONV_TYPE}&product={PRODUCT_CODENAME}`
4. **Google Ads**:
   - Crie uma ação de conversão do tipo *Importar → conversões de cliques*
     com o nome **exatamente igual** a `CONVERSION_NAME` do `.env`.
   - Em *Conversões → Uploads → Programações*, crie uma programação com fonte
     **HTTPS** apontando para `.../google-ads.csv?key=CHAVE`, a cada 6 horas.

A planilha traz as vendas aprovadas dos últimos `EXPORT_DAYS` dias que têm
gclid. O Google ignora as que já importou, então repetir não tem problema.
Reembolsos (`type` com refund/chargeback) saem da planilha e aparecem no painel.

## Endpoints

| Rota | Acesso | O que faz |
| --- | --- | --- |
| `GET /t.js` | público | script da página de review |
| `POST /c`, `POST /o` | público | registra visita / clique no botão |
| `GET\|POST /postback` | `key` | recebe venda da BuyGoods |
| `GET /google-ads.csv` | `key` | planilha de conversões do Google Ads |
| `GET /`, `/configurar` | login | painel e configuração |
| `GET /saude` | público | checagem de "está no ar" |

## Testes

```bash
npm test
```
