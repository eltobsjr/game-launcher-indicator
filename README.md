# Game Launcher (Emuladores) 🎮🐱

Extensão do **GNOME Shell** que coloca um ícone na barra superior com acesso
rápido aos emuladores Nintendo instalados via Flatpak — RetroArch, Dolphin,
melonDS, Azahar, Cemu e Ryujinx. Passe o mouse sobre um emulador no menu e a
lista de jogos daquele console aparece na hora, pronta pra clicar e jogar.
Um gatinho pixel art mora no menu e reage enquanto você navega.

<p align="center">
  <img src="docs/mascot-idle.gif" width="110" alt="Mascote — respirando, parado" />
  <img src="docs/mascot-waiting.gif" width="110" alt="Mascote — esperando você escolher" />
  <img src="docs/mascot-happy.gif" width="110" alt="Mascote — feliz, jogo lançado" />
</p>

## Por que isso existe

Eu tenho seis emuladores instalados e uma pasta cheia de ROMs, e cansei de
abrir o launcher de apps, escolher o emulador certo, esperar ele abrir, e
só então navegar até o jogo pelo seletor de arquivo dele. Essa extensão
resolve isso: um clique na barra superior, passa o mouse no emulador, clica
no jogo, jogando. Sem alternar de janela, sem procurar arquivo.

O gatinho não faz nada funcional — é só porque um menu de emuladores sem
graça nenhuma parecia um desperdício de oportunidade.

## O que a extensão faz

- Ícone fixo na barra superior (posição configurável: direita, esquerda, borda).
- Menu com um item por emulador habilitado; passar o mouse mostra a lista
  de jogos encontrados nas pastas de ROMs configuradas.
- Clicar num jogo abre direto no emulador certo (`flatpak run <app> <rom>`),
  e o painel mostra **"Jogando `<jogo>` no `<emulador>`"** até você fechar o
  emulador — o texto some sozinho, não é um timer arbitrário.
- Cada emulador também tem atalho para "Abrir vazio" e "Abrir pasta de ROMs".
- **Múltiplas pastas de ROMs** — configure quantas quiser (ex.: um HD interno
  e um externo); os jogos de todas são somados na listagem.
- A lista é escaneada com cache de 10s (não trava a UI a cada clique) e tem
  um botão "Atualizar lista de jogos" pra forçar um rescan na hora.
- Emulador não instalado aparece marcado como tal, em vez de listar jogos
  que dariam erro ao abrir.
- O ícone do cabeçalho do menu acompanha a **accent color** escolhida no
  GNOME (GNOME 47+; cai pro azul em versões mais antigas).
- **Mascote reativo**: fica de olho esperando você escolher, presta atenção
  quando você expande um emulador, e comemora quando você lança um jogo.
  Pode opcionalmente substituir o ícone padrão da barra por uma versão dele
  mesmo (parada ou girando em loop) — desligado por padrão, nas preferências.
- Notificação amigável a cada login perguntando se você quer jogar (atraso
  e liga/desliga configuráveis).

## Requisitos

- GNOME Shell 46 a 50
- [Flatpak](https://flatpak.org/) com os emuladores que você usa instalados
  (não precisa ter todos — só habilite os que tiver nas preferências):

| Emulador | Flatpak ID |
|---|---|
| RetroArch | `org.libretro.RetroArch` |
| Dolphin | `org.DolphinEmu.dolphin-emu` |
| melonDS | `net.kuribo64.melonDS` |
| Azahar (Citra) | `org.azahar_emu.Azahar` |
| Cemu | `info.cemu.Cemu` |
| Ryujinx (Ryubing) | `io.github.ryubing.Ryujinx` |

## Estrutura de pastas esperada

Cada pasta configurada nas preferências precisa conter as subpastas de cada
emulador, assim:

```
~/games/Emuladores/          (padrão — ou qualquer pasta(s) que você escolher)
├── RetroArch/Roms/{NES,SNES,N64,GB,GBA,DS}/
├── Dolphin/Roms/
├── melonDS/Roms/
├── Azahar/Roms/
├── Cemu/Roms/
└── Ryujinx/Roms/
```

Você pode adicionar mais de uma pasta-base nas preferências (útil se as
ROMs estão espalhadas entre discos) — os jogos de todas são combinados no
menu.

## Instalar

```bash
git clone git@github.com:eltobsjr/game-launcher-indicator.git
cd game-launcher-indicator
make install
```

No **Wayland**, o GNOME Shell só detecta extensões novas depois de um
logout/login (recarregar com `Alt+F2` → `r` só funciona no X11). Depois de
logar de novo:

```bash
gnome-extensions enable game-launcher@eltobsjr.gmail.com
```

### Tema e opções (escolhidos na instalação)

O `./install.sh` pergunta no terminal, antes de copiar qualquer coisa:

- **Paleta**: Catppuccin Macchiato (padrão), Frappé ou Mocha, com uma prévia em cores.
- **Cor de destaque**: 12 opções, ou **seguir o destaque do GNOME** (47+).
- **Opções da extensão**: posição, mascote, emuladores ativos, pastas de ROMs e avisos.

Nenhuma cor fica escrita no código: o `stylesheet.css` é gerado na instalação a partir da paleta que você escolheu.
Para refazer as escolhas, rode `./install.sh --reconfigure`. Sem terminal (CI, `curl | bash`) ou com `--yes`,
vale o que já estava salvo ou o padrão. Também aceita `--palette macchiato|frappe|mocha`, `--accent blue|mauve|…` e `--system-accent`.
Detalhes do padrão visual em [`docs/DESIGN.md`](docs/DESIGN.md).

## Preferências

- **Geral**: posição na barra, ícone do mascote (liga/desliga + animado),
  notificação de login (liga/desliga + atraso), pastas de ROMs (adicionar
  quantas quiser), máximo de jogos listados por emulador.
- **Emuladores**: liga/desliga cada emulador individualmente no menu.

## Desenvolvimento

```bash
make install   # copia extension/ para ~/.local/share/gnome-shell/extensions/
make pack      # gera o .zip para extensions.gnome.org
make uninstall # remove
```

Todo o código roda em GJS puro (sem build step, sem npm) — edite os
arquivos em `extension/`, rode `make install` e reabra o menu (ou
logout/login se mudou `metadata.json` ou o schema) pra ver o resultado.

Assets do mascote (pixel art) foram gerados via [PixelLab](https://pixellab.ai/).

## Licença

[MIT](LICENSE)
