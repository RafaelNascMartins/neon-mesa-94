import type { VmItemId, WeaponId } from './types';

/**
 * Backpack flavour text: one line on what it does in plain words, one dumb joke.
 * (Item effects themselves live in config.ts — this is just the inventory blurb.)
 */

export const WEAPON_LORE: Record<WeaponId, { what: string; joke: string }> = {
  pistol: {
    what: 'Seu revólver de sempre. Munição infinita, nunca te abandona.',
    joke: 'Já passou por três donos. Todos morreram. Ele não liga.',
  },
  pistols: {
    what: 'Dois revólveres, alternando os tiros. O dobro de chumbo.',
    joke: 'Porque um revólver só não compensa a sua mira.',
  },
  shotgun: {
    what: 'Seis bagos num leque curto. Devastadora de perto.',
    joke: 'Resolve qualquer discussão em até um metro e meio.',
  },
  plasma: {
    what: 'Rajada rápida de raios de energia. Esquenta se abusar.',
    joke: 'Garantia de fábrica vencida em 1994. O cheiro de queimado é "normal".',
  },
  railgun: {
    what: 'Um tiro instantâneo que atravessa todo mundo na linha.',
    joke: 'Física é só uma sugestão quando você tem 3 gigawatts.',
  },
  rocket: {
    what: 'Foguete com explosão em área. Lento, mas convincente.',
    joke: 'Não aponte para o pé. Nem para o pé dos outros perto de você.',
  },
  katana: {
    what: 'Corte largo e rápido. Quebra depois de 40 golpes.',
    joke: 'Comprada num posto de gasolina. "Forjada mil vezes", diz o adesivo.',
  },
  hammer: {
    what: 'Corte lento e pesado com alcance enorme. Arremessa quem pegar.',
    joke: 'Tudo é prego se você estiver bravo o suficiente.',
  },
  nailgun: {
    what: 'Rajada de pregos. Prega os mortos na parede.',
    joke: 'A decoração de interiores mais honesta do deserto.',
  },
  harpoon: {
    what: 'Fisga o inimigo e puxa até você.',
    joke: 'Moby Dick, mas o Moby é um bandido de chapéu.',
  },
  forkbomb: {
    what: 'Se divide em 2, 4, 8 processos. Cada um explode.',
    joke: ':(){ :|:& };: — não rode isso em casa. Nem aqui. Tarde demais.',
  },
  coice: {
    what: 'Dois canos serrados. O coice te arremessa para trás.',
    joke: 'Metade arma, metade método de transporte.',
  },
  juiz: {
    what: 'Segure para encher o tambor, solte para descarregar. As balas ricocheteiam.',
    joke: 'O júri já decidiu. O Juiz só lê a sentença. Seis vezes.',
  },
  faces: {
    what: 'Canhão de boca de sino cercado de máscaras do Cem Faces. Cospe rostos em espiral.',
    joke: 'Ainda reclama de você em voz baixa. Ignora.',
  },
  dinamite: {
    what: 'Arremessa um feixe de dinamite onde você mira. O pavio queima um instante e tudo em volta voa.',
    joke: 'Tecnologia de 1867. Ainda funciona melhor que metade do código deste jogo.',
  },
  macarico: {
    what: 'Cone de fogo contínuo de curto alcance. Derrete quem chegar perto demais.',
    joke: 'Feito pra soldar cano. Usado pra soldar inimigo no chão.',
  },
  disco: {
    what: 'Dispara CDs afiados que atravessam todo mundo e quicam nas paredes até 4 vezes.',
    joke: 'A coletânea "Hits do Deserto 1994". Ninguém aguentava ouvir, então virou munição.',
  },
  corrente: {
    what: 'Segure: depois de uma carguinha sai um raio grosso e contínuo que liga até 4 inimigos e vai queimando todos enquanto a carga durar.',
    joke: 'Um vírus de corrente: "repasse pra 5 inimigos ou morra". Funciona.',
  },
  besta: {
    what: 'Um virote pesado por vez. Demora pra recarregar, mas quem leva é arremessado pra trás.',
    joke: 'Tecnologia medieval com manivela industrial. O melhor dos dois mundos ruins.',
  },
  arco: {
    what: 'Segure por 1 segundo até o chão tremer em volta de você. Solte: a flecha atravessa tudo na linha.',
    joke: 'Paciência é uma virtude. Um segundo de virtude, no caso.',
  },
  rmrf: {
    what: 'Apaga tudo numa faixa da tela. Custa 1 de integridade.',
    joke: 'sudo não incluso. Você vai se arrepender só um pouquinho.',
  },
};

export const ITEM_LORE: Partial<Record<VmItemId, string>> = {
  willow: 'Na prática não defende nada, mas é bom ter ele ativo.',
  cell: 'Uma pilha AA a mais no peito. Não pergunte de qual controle remoto ela saiu.',
  heatsink: 'Um cooler de PC colado com chiclete de menta. A menta ajuda. Cientificamente.',
  overclock: 'Suas pernas rodam acima da frequência recomendada pelo fabricante. O fabricante faliu.',
  ricochet: 'Balas com autoestima: batem na parede, choram um pouco e voltam pra tentar de novo.',
  bladeDash: 'Lâminas costuradas na barra do poncho. Sentar ficou complicado.',
  vampire: 'Bebe o que sobra dos inimigos. Não é nojento se for em pixel. Ok, é um pouco.',
  volatile: 'Os inimigos levam a sério a expressão "sair explodindo". O síndico já ligou.',
  magnet: 'Atrai créditos. E clipes. E chaves. E um garfo, uma vez. E o Wi-Fi do vizinho.',
  firewall: 'Uma parede. Pegando fogo. Bloqueia um golpe. O TI insiste que não é isso que "firewall" significa.',
  doubleTap: 'Às vezes o gatilho dispara duas vezes. O QA marcou como "não vou corrigir".',
  scarf: 'Seu dash vira teleporte com um "puf" de sangue. Ninguém sabe de quem era o sangue. Nem a echarpe.',
  clover: 'Sete folhas. Três são de alface. Funciona mesmo assim.',
  pet: 'Bom garoto! Late em binário, morde em dano real e traz as moedas na boca. Não sabe sentar.',
  charm: 'O inimigo se apaixona por 4 segundos. Depois lembra que te odeia. Igual ao ensino médio.',
  fireAmmo: 'Pra quem acha que o deserto não tá quente o suficiente.',
  iceAmmo: 'Mantenha refrigerado. O inimigo, no caso.',
  homing: 'Elas sabem onde você mora. E onde eles moram também.',
  ghostAmmo: 'Morreram num acidente de tiroteio. Não superaram, e agora atravessam paredes de raiva.',
  fatAmmo: 'Pararam de ir à academia. Agora acertam tudo só pelo tamanho.',
  cookieAmmo: 'Rastreamos você. Pra fins de melhoria da experiência. Aceitar todos?',
  pinball: 'TILT. Cada quique vale ponto. Ninguém sabe onde fica a placa de recorde.',
  shades: 'Você é tão badass que sabe até quando vai ser a morte dos inimigos. Use com moderação.',
  gunboots: 'Atira pelos calcanhares. Ótimo pra fugir, péssimo pra quadrilha junina.',
  bomb: 'Clássica, redonda, com pavio. Comprada no mesmo lugar que os desenhos animados compram.',
  ironSkin: 'Por 5 segundos você vira uma estátua de chumbo que devolve bala. Não tente nadar. Nem pular.',
  pacify: 'Um papel amassado com a assinatura de todo mundo prometendo parar de brigar. Tem uma assinatura que é só um desenho de caveira. Vale por 5 segundos.',
};
