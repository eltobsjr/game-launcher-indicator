import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

// ---------------------------------------------------------------------------
// Catálogo de emuladores
// ---------------------------------------------------------------------------
const EMULATORS = [
    {
        id: 'retroarch', name: 'RetroArch', flatpak: 'org.libretro.RetroArch',
        settingsKey: 'enabled-retroarch', romsSubdir: 'RetroArch/Roms', recursive: true,
        extensions: ['nes', 'sfc', 'smc', 'n64', 'z64', 'v64', 'gb', 'gbc', 'gba', 'nds'],
        launchArgs: path => [path],
    },
    {
        id: 'dolphin', name: 'Dolphin', flatpak: 'org.DolphinEmu.dolphin-emu',
        settingsKey: 'enabled-dolphin', romsSubdir: 'Dolphin/Roms', recursive: false,
        extensions: ['iso', 'rvz', 'wbfs', 'gcm', 'ciso', 'wia'],
        launchArgs: path => ['-e', path],
    },
    {
        id: 'melonds', name: 'melonDS', flatpak: 'net.kuribo64.melonDS',
        settingsKey: 'enabled-melonds', romsSubdir: 'melonDS/Roms', recursive: false,
        extensions: ['nds', 'dsi'],
        launchArgs: path => [path],
    },
    {
        id: 'azahar', name: 'Azahar', flatpak: 'org.azahar_emu.Azahar',
        settingsKey: 'enabled-azahar', romsSubdir: 'Azahar/Roms', recursive: false,
        extensions: ['3ds', 'cia', 'cci', 'cxi', '3dsx'],
        launchArgs: path => [path],
    },
    {
        id: 'cemu', name: 'Cemu', flatpak: 'info.cemu.Cemu',
        settingsKey: 'enabled-cemu', romsSubdir: 'Cemu/Roms', recursive: false,
        extensions: ['wud', 'wux', 'rpx', 'wua'],
        launchArgs: path => ['-g', path],
    },
    {
        id: 'ryujinx', name: 'Ryujinx', flatpak: 'io.github.ryubing.Ryujinx',
        settingsKey: 'enabled-ryujinx', romsSubdir: 'Ryujinx/Roms', recursive: false,
        extensions: ['nsp', 'xci', 'nro'],
        launchArgs: path => [path],
    },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function defaultBaseDir() {
    return GLib.build_filenamev([GLib.get_home_dir(), 'games', 'Emuladores']);
}

function scanDir(dir, extensions, recursive) {
    let results = [];
    const d = Gio.File.new_for_path(dir);
    if (!d.query_exists(null))
        return results;

    let enumerator;
    try {
        enumerator = d.enumerate_children('standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE, null);
    } catch (e) {
        return results;
    }

    try {
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            const type = info.get_file_type();
            const path = GLib.build_filenamev([dir, name]);

            if (type === Gio.FileType.DIRECTORY) {
                if (recursive) {
                    const sub = scanDir(path, extensions, false);
                    sub.forEach(g => (g.system = name));
                    results = results.concat(sub);
                }
            } else if (type === Gio.FileType.REGULAR) {
                const dot = name.lastIndexOf('.');
                const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
                if (extensions.includes(ext))
                    results.push({name, path, system: null});
            }
        }
    } catch (e) {
        logError(e, `game-launcher: falha ao ler ${dir}`);
    } finally {
        try {
            enumerator.close(null);
        } catch (e) { /* já fechado */ }
    }

    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
}

function launchFlatpak(flatpakId, args) {
    try {
        const argv = ['flatpak', 'run', flatpakId, ...args];
        return Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
    } catch (e) {
        logError(e, `game-launcher: falha ao abrir ${flatpakId}`);
        return null;
    }
}

function stripExtension(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
}

function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function openFolder(path) {
    try {
        GLib.mkdir_with_parents(path, 0o755);
        // Não montar a URI à mão: caminhos com espaço/acento precisam de escape.
        const uri = Gio.File.new_for_path(path).get_uri();
        Gio.AppInfo.launch_default_for_uri(uri, null);
    } catch (e) {
        logError(e, 'game-launcher: falha ao abrir pasta');
    }
}

function flatpakAppInfo(flatpakId) {
    try {
        return Gio.DesktopAppInfo.new(`${flatpakId}.desktop`);
    } catch (e) {
        return null;
    }
}

function appGicon(flatpakId) {
    try {
        // O ícone real do .desktop é mais confiável do que chutar o nome temático.
        return flatpakAppInfo(flatpakId)?.get_icon() ?? Gio.Icon.new_for_string(flatpakId);
    } catch (e) {
        return null;
    }
}

function isFlatpakInstalled(flatpakId) {
    return flatpakAppInfo(flatpakId) !== null;
}

const SCAN_CACHE_TTL_MS = 10000;

const MASCOT_FRAME_MS = 130;

function mascotFramePaths(dir, count) {
    const frames = [];
    for (let i = 0; i < count; i++)
        frames.push(GLib.build_filenamev([dir, `${i}.png`]));
    return frames;
}

function mascotSubtitle(state) {
    switch (state) {
    case 'waiting': return _('Esperando você escolher…');
    case 'idle': return _('De olho nos jogos…');
    case 'happy': return _('Bom jogo!');
    default: return '';
    }
}

// ---------------------------------------------------------------------------
// Item de jogo (linha com ícone de "play" + nome)
// ---------------------------------------------------------------------------
const GameItem = GObject.registerClass(
class GameItem extends PopupMenu.PopupBaseMenuItem {
    _init(label, onActivate) {
        super._init({style_class: 'gl-game-item'});

        const box = new St.BoxLayout({x_expand: true, style_class: 'gl-game-box'});
        const icon = new St.Icon({
            icon_name: 'media-playback-start-symbolic',
            style_class: 'gl-game-icon popup-menu-icon',
        });
        const text = new St.Label({text: label, y_align: Clutter.ActorAlign.CENTER, x_expand: true});

        box.add_child(icon);
        box.add_child(text);
        this.add_child(box);

        this.connect('activate', onActivate);
    }
});

// ---------------------------------------------------------------------------
// Indicador da barra superior
// ---------------------------------------------------------------------------
const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, _('Emuladores'), false);
        this._extension = extension;
        this._settings = extension.getSettings();
        this._scanCache = new Map();

        const mascotBaseDir = GLib.build_filenamev([extension.path, 'assets', 'mascot']);
        this._mascotFrames = {
            idle: mascotFramePaths(GLib.build_filenamev([mascotBaseDir, 'idle']), 9),
            waiting: mascotFramePaths(GLib.build_filenamev([mascotBaseDir, 'waiting']), 9),
            happy: mascotFramePaths(GLib.build_filenamev([mascotBaseDir, 'happy']), 9),
        };
        // Versão sem a poltrona, recortada pra ficar legível no tamanho minúsculo do painel.
        const panelMascotDir = GLib.build_filenamev([mascotBaseDir, 'panel']);
        this._mascotStaticPath = GLib.build_filenamev([panelMascotDir, 'static.png']);
        this._panelMascotFrames = mascotFramePaths(GLib.build_filenamev([panelMascotDir, 'idle']), 8);
        this._menuMascotTimeoutId = null;
        this._panelMascotTimeoutId = null;
        this._openSubmenus = 0;
        this._mascotState = null;
        this._mascotIcon = null;
        this._mascotSubtitle = null;
        this._rebuildIdleId = null;
        this._destroyed = false;
        this._playToken = 0;

        this._panelIcon = new St.Icon({style_class: 'system-status-icon gl-panel-icon'});
        this.add_child(this._panelIcon);
        this._updatePanelIcon();

        this._statusLabel = new St.Label({
            style_class: 'gl-status-label',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this.add_child(this._statusLabel);
        this._currentlyPlaying = null;
        this._settingsHandlerIds = [
            this._settings.connect('changed::show-mascot-icon', () => this._updatePanelIcon()),
            this._settings.connect('changed::mascot-animated', () => this._updatePanelIcon()),
        ];

        this.menu.connect('open-state-changed', (menu, open) => {
            if (open) {
                this._rebuild();
                this._setMascotState('waiting');
            } else {
                this._stopMenuMascotAnimation();
            }
        });

        this._rebuild();
    }

    _updatePanelIcon() {
        this._stopPanelMascotAnimation();
        if (this._destroyed || !this._panelIcon)
            return;
        if (!this._settings.get_boolean('show-mascot-icon')) {
            this._panelIcon.gicon = null;
            this._panelIcon.icon_name = 'input-gaming-symbolic';
            return;
        }
        if (this._settings.get_boolean('mascot-animated')) {
            this._startPanelMascotAnimation();
        } else {
            this._panelIcon.gicon = Gio.icon_new_for_string(this._mascotStaticPath);
        }
    }

    _startPanelMascotAnimation() {
        const frames = this._panelMascotFrames;
        let i = 0;
        this._panelIcon.gicon = Gio.icon_new_for_string(frames[0]);
        this._panelMascotTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MASCOT_FRAME_MS, () => {
            if (this._destroyed || !this._panelIcon) {
                this._panelMascotTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            }
            i = (i + 1) % frames.length;
            this._panelIcon.gicon = Gio.icon_new_for_string(frames[i]);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopPanelMascotAnimation() {
        if (this._panelMascotTimeoutId) {
            GLib.source_remove(this._panelMascotTimeoutId);
            this._panelMascotTimeoutId = null;
        }
    }

    _setMascotState(state) {
        // O mascote só existe enquanto o cabeçalho do menu existe. Submenus
        // fecham de forma assíncrona (via 'menu-closed'), então esse método
        // pode ser chamado depois do menu fechar, depois de um _rebuild() ter
        // destruído o cabeçalho, ou até depois do indicador ser destruído.
        if (this._destroyed || !this._mascotIcon || !this.menu.isOpen) {
            this._stopMenuMascotAnimation();
            return;
        }
        const frames = this._mascotFrames[state];
        if (!frames)
            return;
        if (state === this._mascotState && this._menuMascotTimeoutId)
            return; // já animando esse estado — não reiniciar do frame 0

        this._stopMenuMascotAnimation();
        this._mascotState = state;

        let i = 0;
        this._mascotIcon.gicon = Gio.icon_new_for_string(frames[0]);
        this._menuMascotTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MASCOT_FRAME_MS, () => {
            if (this._destroyed || !this._mascotIcon) {
                this._menuMascotTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            }
            i = (i + 1) % frames.length;
            this._mascotIcon.gicon = Gio.icon_new_for_string(frames[i]);
            return GLib.SOURCE_CONTINUE;
        });
        if (this._mascotSubtitle)
            this._mascotSubtitle.text = mascotSubtitle(state);
    }

    _stopMenuMascotAnimation() {
        if (this._menuMascotTimeoutId) {
            GLib.source_remove(this._menuMascotTimeoutId);
            this._menuMascotTimeoutId = null;
        }
    }

    _launchGame(app, game) {
        const proc = launchFlatpak(app.flatpak, app.launchArgs(game.path));
        if (!proc)
            return;

        this._setMascotState('happy');
        const token = ++this._playToken;
        this._currentlyPlaying = {
            token,
            gameName: stripExtension(game.name),
            appName: app.name,
        };
        this._updateStatusLabel();

        proc.wait_async(null, (p, res) => {
            try {
                p.wait_finish(res);
            } catch (e) { /* processo pode ter sido encerrado abruptamente */ }
            if (this._destroyed)
                return;
            if (this._currentlyPlaying?.token === token) {
                this._currentlyPlaying = null;
                this._updateStatusLabel();
            }
        });
    }

    _updateStatusLabel() {
        if (this._destroyed || !this._statusLabel)
            return;
        if (!this._currentlyPlaying) {
            this._statusLabel.hide();
            this._statusLabel.text = '';
            return;
        }
        const {gameName, appName} = this._currentlyPlaying;
        this._statusLabel.text = _('Jogando %s no %s').format(truncate(gameName, 32), appName);
        this._statusLabel.show();
    }

    // PanelMenu.Button faz a limpeza pelo sinal 'destroy' (ButtonBox conecta
    // _onDestroy no _init), então sobrescrever destroy() deixaria os timers
    // vivos se o ator fosse destruído por outro caminho.
    _onDestroy() {
        this._destroyed = true;
        this._stopMenuMascotAnimation();
        this._stopPanelMascotAnimation();
        if (this._rebuildIdleId) {
            GLib.source_remove(this._rebuildIdleId);
            this._rebuildIdleId = null;
        }
        for (const id of this._settingsHandlerIds ?? [])
            this._settings.disconnect(id);
        this._settingsHandlerIds = [];
        this._scanCache.clear();
        this._mascotIcon = null;
        this._mascotSubtitle = null;
        this._statusLabel = null;
        this._panelIcon = null;
        this._currentlyPlaying = null;
        this._settings = null;
        super._onDestroy();
    }

    _baseDirs() {
        const custom = this._settings.get_strv('roms-base-dirs');
        return custom.length > 0 ? custom : [defaultBaseDir()];
    }

    _scanCached(dir, extensions, recursive) {
        const key = `${dir}|${extensions.join(',')}|${recursive}`;
        const now = GLib.get_monotonic_time() / 1000;
        const cached = this._scanCache.get(key);
        if (cached && now - cached.time < SCAN_CACHE_TTL_MS)
            return cached.games;

        const games = scanDir(dir, extensions, recursive);
        this._scanCache.set(key, {time: now, games});
        return games;
    }

    _addHeader() {
        const header = new PopupMenu.PopupBaseMenuItem({
            reactive: false, can_focus: false, style_class: 'gl-header',
        });
        const box = new St.BoxLayout({style_class: 'gl-header-box'});

        this._mascotIcon = new St.Icon({style_class: 'gl-mascot-icon'});
        box.add_child(this._mascotIcon);

        const titleBox = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'gl-title-box'});
        const titleRow = new St.BoxLayout({style_class: 'gl-title-row'});
        const glyph = new St.Icon({
            icon_name: 'input-gaming-symbolic', icon_size: 14,
            style_class: 'gl-header-icon gl-accent',
        });
        const label = new St.Label({
            text: _('Emuladores Nintendo'), y_align: Clutter.ActorAlign.CENTER,
            style_class: 'gl-header-title',
        });
        titleRow.add_child(glyph);
        titleRow.add_child(label);

        this._mascotSubtitle = new St.Label({style_class: 'gl-mascot-subtitle'});

        titleBox.add_child(titleRow);
        titleBox.add_child(this._mascotSubtitle);
        box.add_child(titleBox);

        // menu.removeAll() destrói o cabeçalho antes dos submenus; sem isso as
        // referências ficariam apontando para atores já desalocados e qualquer
        // acesso viraria "has been already deallocated" no journalctl.
        header.connect('destroy', () => {
            this._stopMenuMascotAnimation();
            this._mascotIcon = null;
            this._mascotSubtitle = null;
            this._mascotState = null;
        });

        header.add_child(box);
        this.menu.addMenuItem(header);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _buildAppSubMenu(app, bases, maxGames) {
        const romsDirs = bases.map(base => GLib.build_filenamev([base, app.romsSubdir]));
        const installed = isFlatpakInstalled(app.flatpak);
        const games = installed
            ? romsDirs.flatMap(dir => this._scanCached(dir, app.extensions, app.recursive))
                .sort((a, b) => a.name.localeCompare(b.name))
            : [];

        const title = installed && games.length > 0 ? `${app.name}  (${games.length})` : app.name;
        const subMenu = new PopupMenu.PopupSubMenuMenuItem(title, true);
        subMenu.icon.style_class = 'popup-menu-icon gl-app-icon';
        const gicon = appGicon(app.flatpak);
        if (gicon)
            subMenu.icon.gicon = gicon;
        else
            subMenu.icon.icon_name = 'input-gaming-symbolic';
        if (!installed)
            subMenu.add_style_class_name('gl-not-installed');
        subMenu.menu.connect('open-state-changed', (_m, open) => {
            this._openSubmenus = Math.max(0, this._openSubmenus + (open ? 1 : -1));
            this._setMascotState(this._openSubmenus > 0 ? 'idle' : 'waiting');
        });

        if (!installed) {
            const notInstalled = new PopupMenu.PopupMenuItem(
                _('%s não está instalado').format(app.name));
            notInstalled.add_style_class_name('gl-empty');
            notInstalled.setSensitive(false);
            subMenu.menu.addMenuItem(notInstalled);
        } else if (games.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(_('Nenhum jogo encontrado'));
            empty.add_style_class_name('gl-empty');
            empty.setSensitive(false);
            subMenu.menu.addMenuItem(empty);
        } else {
            games.slice(0, maxGames).forEach(g => {
                const label = g.system ? `[${g.system}] ${g.name}` : g.name;
                const item = new GameItem(label, () => this._launchGame(app, g));
                subMenu.menu.addMenuItem(item);
            });
            if (games.length > maxGames) {
                const more = new PopupMenu.PopupMenuItem(
                    _('… e mais %d jogo(s)').format(games.length - maxGames));
                more.setSensitive(false);
                subMenu.menu.addMenuItem(more);
            }
        }

        subMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (installed) {
            const openApp = new PopupMenu.PopupImageMenuItem(
                _('Abrir %s').format(app.name), 'application-x-executable-symbolic');
            openApp.connect('activate', () => {
                this._setMascotState('happy');
                launchFlatpak(app.flatpak, []);
            });
            subMenu.menu.addMenuItem(openApp);
        }

        romsDirs.forEach((dir, i) => {
            const label = romsDirs.length > 1
                ? _('Abrir pasta de ROMs (%s)').format(GLib.path_get_basename(bases[i]))
                : _('Abrir pasta de ROMs');
            const openRoms = new PopupMenu.PopupImageMenuItem(label, 'folder-symbolic');
            openRoms.connect('activate', () => openFolder(dir));
            subMenu.menu.addMenuItem(openRoms);
        });

        return subMenu;
    }

    _rebuild() {
        if (this._destroyed)
            return;

        this.menu.removeAll();
        // removeAll() destrói submenus abertos, e cada um emite
        // open-state-changed(false). Zerar depois evita o contador ficar
        // preso em >0 (mascote travado em 'idle') ou negativo.
        this._openSubmenus = 0;
        this._addHeader();

        const bases = this._baseDirs();
        const maxGames = this._settings.get_int('max-games-per-app');
        let any = false;

        for (const app of EMULATORS) {
            if (!this._settings.get_boolean(app.settingsKey))
                continue;
            any = true;
            // Um emulador problemático (pasta ilegível, ícone quebrado) não
            // pode derrubar a construção do menu inteiro.
            try {
                this.menu.addMenuItem(this._buildAppSubMenu(app, bases, maxGames));
            } catch (e) {
                logError(e, `game-launcher: falha ao montar o menu de ${app.name}`);
            }
        }

        if (!any) {
            const none = new PopupMenu.PopupMenuItem(
                _('Nenhum emulador habilitado — veja as preferências'));
            none.setSensitive(false);
            this.menu.addMenuItem(none);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupImageMenuItem(
            _('Atualizar lista de jogos'), 'view-refresh-symbolic');
        refreshItem.connect('activate', () => {
            this._scanCache.clear();
            // Reconstruir aqui dentro chamaria removeAll() — destruindo o
            // próprio refreshItem no meio da emissão do sinal 'activate' dele.
            this._queueRebuild();
        });
        this.menu.addMenuItem(refreshItem);

        const prefsItem = new PopupMenu.PopupImageMenuItem(
            _('Preferências'), 'preferences-system-symbolic');
        prefsItem.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(prefsItem);

        // Se o menu já estava aberto (refresh manual), devolve o mascote ao
        // estado correto — o cabeçalho antigo foi destruído acima.
        if (this.menu.isOpen)
            this._setMascotState(this._openSubmenus > 0 ? 'idle' : 'waiting');
    }

    _queueRebuild() {
        if (this._rebuildIdleId)
            return;
        this._rebuildIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._rebuildIdleId = null;
            this._rebuild();
            return GLib.SOURCE_REMOVE;
        });
    }

    open() {
        this.menu.open(BoxPointer.PopupAnimation.FULL);
    }
});

// ---------------------------------------------------------------------------
// Extensão
// ---------------------------------------------------------------------------
export default class GameLauncherExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._notificationSource = null;
        this._notifyTimeoutId = null;
        this._posHandler = this._settings.connect('changed::panel-position',
            () => this._reposition());
        this._create();

        if (this._settings.get_boolean('show-login-notification')) {
            const delay = this._settings.get_int('notification-delay');
            this._notifyTimeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, Math.max(delay, 1), () => {
                    this._notifyTimeoutId = null;
                    this._showLoginNotification();
                    return GLib.SOURCE_REMOVE;
                });
        }
    }

    _create() {
        this._indicator = new Indicator(this);
        const pos = this._settings.get_string('panel-position');
        switch (pos) {
        case 'left':
            Main.panel.addToStatusArea(this.uuid, this._indicator, -1, 'left');
            break;
        case 'left-edge':
            Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'left');
            break;
        default: // 'right'
            Main.panel.addToStatusArea(this.uuid, this._indicator);
            break;
        }
    }

    _reposition() {
        // destroy() já remove o indicador de Main.panel.statusArea; o delete é
        // só uma rede de segurança contra o "Extension point conflict".
        this._indicator?.destroy();
        this._indicator = null;
        delete Main.panel.statusArea[this.uuid];
        this._create();
    }

    _showLoginNotification() {
        try {
            const source = new MessageTray.Source({
                title: _('Emuladores'),
                iconName: 'input-gaming-symbolic',
            });
            // A Source se autodestrói quando fica sem notificações; guardar a
            // referência só pra poder limpá-la no disable().
            source.connect('destroy', () => {
                this._notificationSource = null;
            });
            this._notificationSource = source;
            Main.messageTray.add(source);

            const notification = new MessageTray.Notification({
                source,
                title: _('🎮 Bem-vindo de volta!'),
                body: _('Quer abrir algum emulador?'),
                iconName: 'input-gaming-symbolic',
            });
            notification.addAction(_('Ver jogos'), () => this._indicator?.open());
            source.addNotification(notification);
        } catch (e) {
            logError(e, 'game-launcher: falha ao mostrar notificação de login');
        }
    }

    disable() {
        if (this._notifyTimeoutId) {
            GLib.source_remove(this._notifyTimeoutId);
            this._notifyTimeoutId = null;
        }
        if (this._posHandler) {
            this._settings.disconnect(this._posHandler);
            this._posHandler = null;
        }
        // destroy() emite o sinal 'destroy' com param_types [uint]: passar
        // undefined faria o GJS reclamar do argumento do sinal.
        this._notificationSource?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
        this._notificationSource = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
