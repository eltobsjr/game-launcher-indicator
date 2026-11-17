# CLAUDE.md — Game Launcher

## 1. Sempre ler a memória antes de começar

Ao iniciar qualquer conversa neste projeto:

1. Leia o índice de memória: `~/.claude/projects/-home-eltobsjr-dev-linux-game-launcher-indicator/memory/MEMORY.md`
   É um índice — siga os links para os arquivos relevantes à tarefa atual.

2. Leia o devtrack mais recente:
   `ls /home/eltobsjr/dev/linux/game-launcher-indicator/GameLauncherSecondBrain/devtrack/ | sort | tail -1`
   e leia o arquivo retornado. Isso garante continuidade: o que foi feito,
   decisões tomadas e pendências abertas na última sessão.

## 2. Stack e tecnologias

- **GJS** (GNOME JavaScript, ESM) — GNOME Shell extension API 45–48
- **GObject Introspection**: `St`/`Clutter` (widgets do Shell), `Gio`/`GLib` (settings,
  subprocess, arquivos), `PanelMenu`/`PopupMenu`/`MessageTray` (APIs do Shell)
- **Adwaita (Adw) + Gtk4** para a janela de preferências (`prefs.js`)
- **GSettings/gschema** para configuração persistente (`schemas/*.gschema.xml`)
- **Flatpak** — todos os emuladores são lançados via `flatpak run <app-id> [args] <rom>`
- **PixelLab** (MCP) — geração dos assets pixel art do mascote (gato chibi)
- **Make** — `make install` / `make pack` / `make uninstall` (ver Makefile)

## 3. Estrutura do projeto

- `extension/` — código-fonte real da extensão, é isso que `make install` copia
  para `~/.local/share/gnome-shell/extensions/game-launcher@eltobsjr.gmail.com/`
  - `extension.js` — indicador da barra, menu popup, scan/lançamento de ROMs,
    máquina de estados do mascote, status "jogando X no Y"
  - `prefs.js` — janela de preferências Adwaita
  - `schemas/org.gnome.shell.extensions.game-launcher.gschema.xml` — chaves de settings
  - `stylesheet.css` — CSS do St/Clutter
  - `assets/mascot/` — frames PNG do mascote (menu: `idle/waiting/happy` 9 frames
    cada, com poltrona; painel: `panel/static.png` + `panel/idle/0-7.png`, sem
    poltrona, giro de rotações)
- `assets/mascot/` (raiz do repo, **fora** de `extension/`) — cópia de trabalho dos
  assets gerados via PixelLab (rotations, gifs de preview). **Não é copiada pelo
  `make install`** — qualquer asset que a extensão precisa usar em runtime tem
  que estar duplicado dentro de `extension/assets/`.
- `Makefile`, `install.sh` — instalação local e empacotamento (`.shell-extension.zip`)
- `README.md` — desatualizado em alguns pontos (não menciona ainda cache de
  scan, múltiplas pastas de ROMs, nem o mascote) — preferir este CLAUDE.md e o
  vault como fonte de verdade sobre o estado atual.

## 4. Documentação

Toda documentação fica no vault: `GameLauncherSecondBrain/`
Logs de sessão: `GameLauncherSecondBrain/devtrack/`
Formato dos logs: `YYYY-MM-DD - Título.md`

## 5. Regras de desenvolvimento

- Sempre rodar `make install` depois de editar qualquer arquivo em `extension/`
  antes de considerar uma tarefa terminada — sem isso a extensão instalada
  fica desatualizada.
- Assets que a extensão usa em runtime (ex.: PNGs do mascote) precisam ser
  copiados para dentro de `extension/assets/`, não só para a pasta `assets/`
  da raiz — só `extension/` é copiada pelo Makefile.
- Depois de editar `schemas/*.gschema.xml`, o `make install` já roda
  `glib-compile-schemas` automaticamente — mas se testar manualmente, lembrar
  de compilar antes de usar `gsettings`/`Gio.Settings` no schema editado.
- A extensão nunca rodou de verdade ainda: falta o usuário fazer logout/login
  (GNOME Shell no Wayland só detecta extensões novas depois disso — `Alt+F2 r`
  não funciona como no X11) e então `gnome-extensions enable
  game-launcher@eltobsjr.gmail.com`.
- Antes de qualquer geração nova no PixelLab, checar o saldo de créditos
  (`mcp__pixellab__get_balance`) — é conta trial com limite de gerações.

## 6. Fluxo de trabalho

1. Ler memória e devtrack mais recente
2. Entender o contexto antes de implementar
3. Implementar
4. Rodar `node --check` nos arquivos `.js` editados e `make install`
5. Atualizar devtrack ao final da sessão
