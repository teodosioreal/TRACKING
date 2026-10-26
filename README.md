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

## Atualização automática e backup

```bash
cp deploy/tracking-update.* deploy/tracking-backup.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tracking-update.timer tracking-backup.timer
```

- **Atualização:** a cada minuto a VPS verifica a branch `main` no GitHub.
  Se tiver commit novo, ela puxa, roda os testes, reinicia e confere
  `/saude`. Se algo falhar, volta sozinha para a versão anterior e não
  tenta de novo a mesma versão. Log: `journalctl -u tracking-update -n 50`.
- **Backup:** todo dia às 04:00 grava uma cópia do banco em
  `dados/backups/` e guarda os últimos 14 dias.

## Como usar

Abra `https://tracking.odingdong.tech` (login do `.env`).

1. **Produtos → Novo produto**: nome, plataforma (BuyGoods), nome da
   conversão no Google Ads e o endereço da página de review.
2. Na página do produto, siga os 3 passos. O quadro **Status da
   configuração** se atualiza sozinho e mostra o que já está funcionando:
   - script instalado na página e quantos links da BuyGoods ele marcou;
   - visita vinda do Google Ads (gclid);
   - venda recebida da BuyGoods;
   - Google Ads lendo a planilha.
3. **Testar instalação** abre a página com `?rt_teste=1`; essa visita fica
   marcada como teste e não entra nos números. **Simular venda de teste**
   liga uma venda falsa à última visita do produto (não vai pro Google Ads).

Detalhes:

- **Link de afiliado**: o script reconhece o botão de compra pelo domínio do
  link cadastrado no produto, por links com `aff_id=` (formato da BuyGoods,
  que costuma ir direto para o site do produtor) e por links para buygoods.
  Ele grava o ID da visita no `subid`; um subid fixo que já estava no link
  vai para o `subid2`.
- **Outras plataformas**: escolha "Outra plataforma" e, em Configurações →
  Avançado, o parâmetro que a plataforma devolve no postback (ex.: `tid`).

- O **postback da BuyGoods é um só** para todos os produtos
  (Configurações). A venda cai no produto certo pela visita que a gerou.
- Cada produto tem sua **planilha** (`/google-ads.csv?key=...&produto=ID`)
  com o seu nome de conversão. Se todos os produtos rodam na mesma conta do
  Google Ads, dá para usar a planilha geral (`/google-ads.csv?key=...`).
- Vendas aprovadas dos últimos `EXPORT_DAYS` dias, com gclid. O Google
  ignora o que já importou. Reembolsos saem da planilha.

## Endpoints

| Rota | Acesso | O que faz |
| --- | --- | --- |
| `GET /t.js` | público | script da página de review |
| `POST /c`, `/o`, `/p` | público | visita / clique no botão / sinal do script |
| `GET\|POST /postback` | `key` | recebe venda da BuyGoods |
| `GET /google-ads.csv` | `key` | planilha de conversões do Google Ads |
| `GET /`, `/produtos`, `/configuracoes` | login | painel, produtos e configurações |
| `GET /saude` | público | checagem de "está no ar" |

## Testes

```bash
npm test
```
