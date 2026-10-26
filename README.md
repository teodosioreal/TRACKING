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
            Script do Google Ads (Por hora) lê a planilha e envia as vendas
```

Node puro + SQLite embutido. **Zero dependências** (não precisa de `npm install`).
Requer **Node 22.13 ou mais novo**.

## Rodar na VPS (junto com o CRM, mas separado)

O rastreador roda na mesma VPS do CRM, num subdomínio próprio
(`tracking.odingdong.tech`), com pasta, serviço e porta (`PORT` no `.env`,
padrão 3101) só dele. O servidor escuta só em `127.0.0.1` (`HOST` no `.env`):
de fora, só o Nginx chega nele.
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
- A porta do `proxy_pass` (Nginx) ou do `reverse_proxy` (Caddy) tem que ser
  **igual ao `PORT` do `.env`** (padrão 3101). Se 3101 estiver em uso, troque
  nos dois lugares. Para conferir: `ss -ltnp | grep node`.

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

## Páginas

- **Visão geral**: comissão, vendas, visitas, gráfico por hora/dia, origem das
  visitas e resultados por campanha/palavra-chave.
- **Filtro Todos / Pago / Não pago** (Visão geral, Visitantes e Vendas): separa
  tráfego pago (Google Ads e outros pagos) do não pago (orgânico, direto,
  referência). A escolha fica lembrada até você mudar. Vendas sem clique não
  têm origem e só aparecem em Todos.
- **Visitantes**: cada visita com IP, origem (Pago, Orgânico, Referência,
  Direto, Teste), produto, campanha/palavra-chave, aparelho, se clicou para
  comprar e se comprou. Opção “Ao vivo” (atualiza a cada 10 s).
- **Vendas**: só vendas reais (testes ficam ocultos), com origem (Pago,
  Orgânico, Sem clique...), IP e botão Excluir.
- **Diagnóstico**: revisão automática do que impede visitas e vendas de
  chegarem ao Google Ads (HTTPS, postback sem subid, script parado ou com
  erro, páginas sem sinal do script ou sem link de afiliado, visitas pagas sem
  campanha, e o motivo de cada venda que não foi para o Google). Tem o botão
  “Reenviar últimos 30 dias”. Na VPS: `cd /opt/tracking && npm run diagnostico`.
- **Produtos** e **Configurações**.

## Como usar

Abra `https://tracking.odingdong.tech` e entre com `ADMIN_USER` e
`ADMIN_PASSWORD` do `.env`. A sessão fica num cookie (HttpOnly, Secure,
SameSite=Lax) por 30 dias; **Sair** no topo encerra. Trocar a senha no `.env`
derruba todas as sessões. Depois de 10 senhas erradas, o IP espera 15 minutos.

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

- **Link de afiliado**: com o link cadastrado no produto, o script marca só
  os links desse domínio (em buygoods.com, clickbank.net, digistore24.com e
  hotmart.com, também da mesma oferta). Assim, numa página com vários
  produtos, cada script marca só o botão do seu produto. Sem link cadastrado,
  marca links com `aff_id=` (BuyGoods) e links para buygoods. Também reconhece
  `<button onclick>`, `data-href` e formulários.
  Ele grava o ID da visita no `subid`; um subid fixo que já estava no link
  vai para o `subid2`.
- **Outras plataformas**: escolha "Outra plataforma" e, em Configurações →
  Avançado, o parâmetro que a plataforma devolve no postback (ex.: `tid`).

- O **postback da BuyGoods é um só** para todos os produtos
  (Configurações). A venda cai no produto certo pela visita que a gerou.
- **Google Ads**: em cada conta de anúncios, crie a ação de conversão de cada
  produto (Conversões off-line, categoria Compra, moeda USD) e cole o script
  de Configurações (`deploy/google-ads-script.js`, com Frequência “Por hora”).
  O passo a passo atualizado está na aba **3. Google Ads** do produto. O
  script lê `/google-ads.csv?key=...&dias=3` (todas as vendas, cada uma com o
  nome de conversão do seu produto).
- Vendas aprovadas dos últimos `EXPORT_DAYS` dias, com gclid. O Google
  ignora o que já importou. Reembolsos saem da planilha.

## Endpoints

| Rota | Acesso | O que faz |
| --- | --- | --- |
| `GET /t.js` | público | script da página de review |
| `POST /c`, `/o`, `/p` | público | visita / clique no botão / sinal do script |
| `GET\|POST /postback` | `key` | recebe venda da BuyGoods |
| `GET /google-ads.csv` | `key` | planilha de conversões do Google Ads |
| `POST /script-relatorio` | `key` | o script do Google Ads informa quantas vendas enviou ou o erro |
| `GET /login`, `POST /login`, `POST /sair` | público | entrar e sair |
| demais páginas (`/`, `/visitantes`, `/vendas`, `/produtos`, `/configuracoes`...) | sessão | painel |
| `GET /saude` | público | checagem de "está no ar" |

## Testes

```bash
npm test
```
