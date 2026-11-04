---
impacto: capacidade_nova
secao: adicionado
titulo: Dá para limitar o raciocínio dos modelos pela OpenRouter com OPENROUTER_REASONING_EFFORT
---

Vários modelos da OpenRouter raciocinam por obrigação e, por padrão, no esforço
máximo. O `z-ai/glm-5.3-flash` é um deles. O raciocínio conta no teto de saída
da resposta (4096 tokens), e em mensagens longas o modelo podia gastar o teto
inteiro pensando: medido em produção, um formulário de cadastro de 11 campos
fez o turno acabar sem nenhuma mensagem ao cliente, depois de 73 s, com duas
tentativas cortadas no limite. As mensagens curtas passavam; a que fecha a
venda, não.

Agora a variável `OPENROUTER_REASONING_EFFORT` no `.env` regula esse esforço
para as chamadas feitas pela OpenRouter. Medido contra a API real com o mesmo
formulário, no `glm-5.3-flash`: com `low`, a resposta caiu de 8 s para 1,4–3,2 s
e de 292 para 0–33 tokens de raciocínio, e chamou as ferramentas certas nas 5
vezes. Valores aceitos: `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.
Vazio mantém o padrão de cada modelo, como antes. `none` não é aceito, porque
os modelos de raciocínio obrigatório recusam toda chamada com ele. Modelo sem
raciocínio ignora o campo. Grafia errada impede o worker de subir e o log diz
qual variável corrigir. Vale só para a OpenRouter; os outros provedores não
mudam.
