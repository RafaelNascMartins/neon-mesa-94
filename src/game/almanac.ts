import type { EnemyArchetype } from './types';

/**
 * Almanac (backpack → "Almanaque"): every creature you've met, the arsenal and the items.
 * Enemies and bosses unlock as they're seen (ids saved in progress.seenEnemies).
 */

export type AlmanacEnemyId = Exclude<EnemyArchetype, 'boss'> | 'flyer' | 'hexer';
export type AlmanacBossId = 'boss' | 'boss2';
export type AlmanacCreatureId = AlmanacEnemyId | AlmanacBossId;

export interface CreatureEntry {
  id: AlmanacCreatureId | `blob_${string}`;
  name: string;
  /** Where you meet it. */
  habitat: string;
  /** What it does, plainly. */
  what: string;
  /** How to beat it. */
  tip: string;
  joke: string;
  /** Threat level 1–5 (skulls). */
  threat: number;
  /** Swatch for the card. */
  color: string;
}

export const ENEMY_ALMANAC: CreatureEntry[] = [
  {
    id: 'rustler',
    name: 'Rustler',
    habitat: 'Estrada, deserto, cemitério',
    what: 'Bandido de chapéu que corre até você e dá um bote curto. Machuca no contato.',
    tip: 'Deixe ele se comprometer com o bote e saia de lado com o dash.',
    joke: 'Roubou um cavalo uma vez. O cavalo roubou ele de volta.',
    threat: 1,
    color: '#ff8a3a',
  },
  {
    id: 'ranger',
    name: 'Deadeye',
    habitat: 'Estrada, deserto, cemitério',
    what: 'Fica longe, entoa um canto e solta um leque de três raios verdes.',
    tip: 'Quando ele começar a cantar, ande na diagonal: o leque é largo, mas lento.',
    joke: 'Tem mira perfeita. Pena que mira em você.',
    threat: 2,
    color: '#4dff7a',
  },
  {
    id: 'charger',
    name: 'Cyber-Bull',
    habitat: 'Deserto, cemitério',
    what: 'Touro cibernético: risca o chão com o casco e investe em linha reta.',
    tip: 'A faixa no chão mostra exatamente por onde ele vai passar. Não fique nela.',
    joke: 'Não gosta da cor vermelha. Você está de poncho vermelho. Boa sorte.',
    threat: 2,
    color: '#ff4a6a',
  },
  {
    id: 'spider',
    name: 'ARACHNID.EXE',
    habitat: 'Cemitério, Árvore Binária',
    what: 'Aranha que salta em você. Quando morre, pisca vermelho e EXPLODE com força.',
    tip: 'Mate de longe e se afaste do círculo vermelho. A explosão fere os outros inimigos também.',
    joke: 'Executável não assinado. Você clicou em "executar mesmo assim".',
    threat: 3,
    color: '#b04dff',
  },
  {
    id: 'spore',
    name: 'VIRAL_SPORE',
    habitat: 'Árvore Binária',
    what: 'Arremessa bolhas de névoa roxa que ficam no chão e envenenam.',
    tip: 'Não fique parado na névoa. Mate rápido: ele enche a sala de veneno.',
    joke: 'Espirrou uma vez e criou um patch de segurança.',
    threat: 2,
    color: '#4dff9a',
  },
  {
    id: 'mantis',
    name: 'ROOT_STALKER',
    habitat: 'Árvore Binária',
    what: 'Louva-a-deus de raiz que dá investidas ainda mais rápidas que o touro.',
    tip: 'Mesma regra do touro, mas com menos tempo. Leia a faixa e reaja antes.',
    joke: 'Tem acesso root. Usa pra te dar rasteira.',
    threat: 3,
    color: '#6ad84a',
  },
  {
    id: 'juggernaut',
    name: 'IRONCLAD',
    habitat: 'Deserto, cemitério, Árvore Binária',
    what: 'Tanque blindado que dispara foguetes pro alto. Eles caem em alvos marcados ao seu redor.',
    tip: 'Fique se mexendo: os foguetes caem onde você ESTAVA. Muita vida, então traga arma pesada.',
    joke: 'Pesa 3 toneladas e ainda reclama da dieta.',
    threat: 4,
    color: '#5a7cff',
  },
  {
    id: 'tesla',
    name: 'VOLT_WRAITH',
    habitat: 'Cemitério, Árvore Binária',
    what: 'Uma caveira pilotando uma navezinha tesla. Dispara dois raios rápidos de alta voltagem pelas antenas da frente.',
    tip: 'Os raios são rápidos, mas retos. Ande em círculos ao redor dele.',
    joke: 'Morreu pegando um fio desencapado. Agora tem carteira de motorista de nave.',
    threat: 3,
    color: '#46e8ff',
  },
  {
    id: 'bombardier',
    name: 'DATA-BOMBARDIER',
    habitat: 'Árvore Binária',
    what: 'Mago catalisador: frágil, corcunda, só osso e cajado. Não ataca: canaliza energia num aliado e deixa ele mais forte.',
    tip: 'Mate o mago primeiro. Ele cai com pouco, e um inimigo turbinado dá muito mais trabalho.',
    joke: 'Treme o tempo todo. Ninguém sabe se é magia ou se é frio.',
    threat: 2,
    color: '#ffd23a',
  },
  {
    id: 'flyer',
    name: 'Urubu de Sucata',
    habitat: 'Salas com buracos e lava',
    what: 'Voa por cima dos buracos e da lava, então chega por onde os outros não passam.',
    tip: 'Ele não cai: não adianta atrair pro buraco. Atire enquanto ele mergulha.',
    joke: 'Come restos de robô. Acha o Cem Faces um banquete.',
    threat: 2,
    color: '#ff9ad8',
  },
  {
    id: 'hexer',
    name: 'Bruxo Negro',
    habitat: 'Depois da segunda vinda do Cem Faces',
    what: 'Mago preto e vermelho. Liga um inimigo a ele por um raio e amaldiçoa a vítima.',
    tip: 'Siga a linha de choque até o bruxo e mate ele: a maldição some junto.',
    joke: 'Fez um curso de magia online. Pagou com cartão clonado.',
    threat: 4,
    color: '#e0283a',
  },
];

export const BOSS_ALMANAC: CreatureEntry[] = [
  {
    id: 'boss',
    name: 'Cem Faces',
    habitat: 'Árvore Binária · profundidade 10',
    what: 'Um amontoado de monitores com cem rostos e pernas de aranha. Salta e esmaga, gira disparando rajadas, solta um anel de raios e uma chuva de morteiros.',
    tip: 'Olhe o chão: os círculos e as faixas mostram onde ele vai cair e atirar. Quando ele ficar com metade da vida, fica bravo e encadeia saltos.',
    joke: 'Cem rostos e nenhum deles sabe sorrir.',
    threat: 5,
    color: '#ff3b3b',
  },
  {
    id: 'boss2',
    name: 'Cem Faces · Segunda Vinda',
    habitat: 'Árvore Binária · profundidade 15',
    what: 'Ele voltou, remendado e furioso. Lança-chamas que te puxa, saltos, rajadas e investidas que atravessam a sala e derrubam as pilastras.',
    tip: 'Quando ele investir e ficar preso na parede, é a sua janela. Não se esconda atrás das pilastras por muito tempo: ele derruba.',
    joke: '"I will splash you like a bug." Ele ainda não sabe o que vem depois.',
    threat: 5,
    color: '#ff6a1a',
  },
];

const blob = (id: AlmanacEnemyId, name: string, of: string, what: string, joke: string, threat: number, color: string): CreatureEntry => ({
  id: `blob_${id}`,
  name,
  habitat: 'Campo Aero (depois da reescrita)',
  what: `Versão gelatina do ${of}. ${what}`,
  tip: 'Mesmas habilidades de antes, mesma tática. Só é mais fofo de matar.',
  joke,
  threat,
  color,
});

/** The Frutiger Aero world rebuilt every enemy as a glossy jelly blob (same abilities). */
export const AERO_ALMANAC: CreatureEntry[] = [
  blob('rustler', 'Rustler de Gelatina', 'Rustler', 'Ainda dá o bote, agora com um chapeuzinho de geleia.', 'Quica quando cai. Ele adora. Você não.', 1, '#ff8a3a'),
  blob('ranger', 'Deadeye Bolha', 'Deadeye', 'Carrega um rifle de geleia que atira o mesmo leque de raios.', 'O canto agora soa como alguém fazendo bolha de chiclete.', 2, '#3ab8ff'),
  blob('charger', 'Touro Pudim', 'Cyber-Bull', 'Investe em linha reta com dois chifres brancos e lisos.', 'Treme inteiro antes de correr. É o pudim mais perigoso do mundo.', 2, '#ff4a6a'),
  blob('spider', 'Aranha Jujuba', 'ARACHNID.EXE', 'Oito perninhas de gelatina verde-limão. Ainda explode quando morre.', 'Cheira a uva. A explosão também.', 3, '#b04dff'),
  blob('spore', 'Esporo Menta', 'VIRAL_SPORE', 'Joga névoa venenosa com cheirinho refrescante.', 'Veneno sabor hortelã. O nutricionista não aprova.', 2, '#4dff9a'),
  blob('mantis', 'Louva-a-Geleia', 'ROOT_STALKER', 'Investe rápido com duas foices de geleia branca.', 'As foices não cortam, mas grudam. O que é pior.', 3, '#6ad84a'),
  blob('juggernaut', 'Gelatanque', 'IRONCLAD', 'Grande e azul. As chaminés de bolha ainda chovem foguetes.', 'Três toneladas de gelatina. A colher não aguentou.', 4, '#5a7cff'),
  blob('tesla', 'Bolha Volt', 'VOLT_WRAITH', 'Uma caveira de gelatina pilotando uma navezinha de gelatina. Ainda dispara raios.', 'Treme quando acelera. A nave também.', 3, '#46e8ff'),
  blob('bombardier', 'Catalisador Chiclete', 'mago catalisador', 'Continua corcunda, tremendo e turbinando os aliados, agora em versão gelatina de uva.', 'Torce pelos amigos com a voz fininha de quem respirou hélio.', 2, '#ffd23a'),
  blob('flyer', 'Urubu de Algodão-Doce', 'Urubu de Sucata', 'Voa com asinhas de bolha por cima de tudo.', 'Se chover, derrete.', 2, '#ff9ad8'),
];
