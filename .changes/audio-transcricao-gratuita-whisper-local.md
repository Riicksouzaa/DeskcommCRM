---
impacto: capacidade_nova
secao: adicionado
titulo: Áudios voltam a ser lidos sem modelo padrão com chave, e dá para transcrever de graça no próprio servidor
---

Medido em produção: numa organização com só a chave da OpenRouter e o modelo
padrão ainda no valor de fábrica (`anthropic`), o agente conversava normalmente,
mas nenhuma nota de voz virava texto. Toda mensagem de áudio terminava com
"org sem credencial LLM utilizável", porque o worker de mídia procurava a chave
do modelo padrão antes de decidir quem transcreve. Agora, para áudio, a falta
dessa chave não interrompe mais a leitura. A escada de transcrição decide, e
vários degraus dela não precisam de modelo de conversa.

Também há um jeito novo de transcrever sem custo: o serviço `whisper`
(faster-whisper, imagem `speaches` 0.8.3) no `docker-compose.prod.yml`. Ele roda
na própria VPS, não pede chave e o áudio do cliente não sai do servidor. Para
ligar, ponha `COMPOSE_PROFILES=transcricao-local` e `TRANSCRICAO_LOCAL=ligada`
no `.env` e suba de novo. O modelo padrão é `Systran/faster-whisper-small` e o
idioma padrão é português (`TRANSCRIPTION_MODEL` e `TRANSCRIPTION_LANGUAGES`
trocam os dois). Medido: uma nota de voz de 7 s em português, em OGG/Opus como
o WhatsApp envia, saiu transcrita sem erro em cerca de 3 s, com o serviço
ocupando cerca de 710 MiB de RAM. Desligado, que é o padrão, nada muda.
