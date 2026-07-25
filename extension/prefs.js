import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const EMULATOR_ROWS = [
    ['enabled-retroarch', 'RetroArch', 'org.libretro.RetroArch — NES, SNES, N64, GB, GBA, DS'],
    ['enabled-dolphin', 'Dolphin', 'org.DolphinEmu.dolphin-emu — GameCube, Wii'],
    ['enabled-melonds', 'melonDS', 'net.kuribo64.melonDS — DS / DSi'],
    ['enabled-azahar', 'Azahar', 'org.azahar_emu.Azahar — 3DS'],
    ['enabled-cemu', 'Cemu', 'info.cemu.Cemu — Wii U'],
    ['enabled-ryujinx', 'Ryujinx (Ryubing)', 'io.github.ryubing.Ryujinx — Switch'],
];

function defaultBaseDir() {
    return GLib.build_filenamev([GLib.get_home_dir(), 'games', 'Emuladores']);
}

export default class GameLauncherPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(620, 640);

        // =================== Página: Geral ===================
        const page = new Adw.PreferencesPage({
            title: _('Geral'),
            icon_name: 'preferences-desktop-display-symbolic',
        });
        window.add(page);

        // --- Barra superior ---
        const panelGroup = new Adw.PreferencesGroup({
            title: _('Barra superior'),
            description: _('Onde e como o indicador aparece'),
        });
        page.add(panelGroup);

        const posicoes = [
            ['right', _('Direita')],
            ['left', _('Esquerda')],
            ['left-edge', _('Esquerda (borda)')],
        ];
        const posRow = new Adw.ComboRow({
            title: _('Posição do ícone'),
            model: Gtk.StringList.new(posicoes.map(p => p[1])),
        });
        const currentPos = settings.get_string('panel-position');
        posRow.selected = Math.max(0, posicoes.findIndex(p => p[0] === currentPos));
        posRow.connect('notify::selected', () => {
            settings.set_string('panel-position', posicoes[posRow.selected][0]);
        });
        panelGroup.add(posRow);

        const notifyRow = new Adw.SwitchRow({
            title: _('Perguntar a cada login'),
            subtitle: _('Mostra uma notificação amigável perguntando se você quer jogar'),
        });
        settings.bind('show-login-notification', notifyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(notifyRow);

        const delayRow = new Adw.SpinRow({
            title: _('Atraso da notificação'),
            subtitle: _('Segundos após o login antes do aviso aparecer'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 60, step_increment: 1, page_increment: 5}),
        });
        settings.bind('notification-delay', delayRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        notifyRow.bind_property('active', delayRow, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
        panelGroup.add(delayRow);

        const mascotRow = new Adw.SwitchRow({
            title: _('Ícone do mascote'),
            subtitle: _('Usa o gatinho no lugar do ícone de controle na barra'),
        });
        settings.bind('show-mascot-icon', mascotRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(mascotRow);

        const mascotAnimRow = new Adw.SwitchRow({
            title: _('Mascote animado'),
            subtitle: _('Gira em loop no painel, em vez de uma pose parada'),
        });
        settings.bind('mascot-animated', mascotAnimRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        mascotRow.bind_property('active', mascotAnimRow, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
        panelGroup.add(mascotAnimRow);

        // --- Biblioteca de jogos ---
        const libGroup = new Adw.PreferencesGroup({
            title: _('Biblioteca de jogos'),
            description: _('De onde os jogos são lidos'),
        });
        page.add(libGroup);

        let folderRows = [];

        function renderFolders() {
            folderRows.forEach(row => libGroup.remove(row));
            folderRows = [];

            const dirs = settings.get_strv('roms-base-dirs');
            if (dirs.length === 0) {
                const row = new Adw.ActionRow({
                    title: defaultBaseDir(),
                    subtitle: _('Padrão — nenhuma pasta customizada adicionada'),
                });
                libGroup.add(row);
                folderRows.push(row);
            } else {
                dirs.forEach(dir => {
                    const row = new Adw.ActionRow({title: dir});
                    const removeBtn = new Gtk.Button({
                        icon_name: 'user-trash-symbolic',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['flat'],
                        tooltip_text: _('Remover esta pasta'),
                    });
                    removeBtn.connect('clicked', () => {
                        // Filtrar pelo caminho, não pelo índice capturado: a
                        // lista pode ter mudado desde que a linha foi criada.
                        const updated = settings.get_strv('roms-base-dirs')
                            .filter(d => d !== dir);
                        settings.set_strv('roms-base-dirs', updated);
                        renderFolders();
                    });
                    row.add_suffix(removeBtn);
                    libGroup.add(row);
                    folderRows.push(row);
                });
            }

            // Adw.PreferencesGroup só sabe anexar no fim, então o botão de
            // adicionar precisa ser reanexado pra continuar sendo a última linha.
            if (addFolderRow.get_parent()) {
                libGroup.remove(addFolderRow);
                libGroup.add(addFolderRow);
            }
        }

        const addFolderRow = new Adw.ActionRow({
            title: _('Adicionar pasta de ROMs…'),
            subtitle: _('Cada pasta deve conter as subpastas de cada emulador, ex.: RetroArch/Roms'),
        });
        const addBtn = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        addBtn.connect('clicked', () => {
            const dialog = new Gtk.FileDialog({title: _('Escolher pasta de ROMs')});
            dialog.select_folder(window, null, (dlg, res) => {
                try {
                    const folder = dlg.select_folder_finish(res);
                    // Pastas remotas (gvfs) não têm caminho local utilizável.
                    const path = folder?.get_path();
                    if (!path)
                        return;
                    const dirs = settings.get_strv('roms-base-dirs');
                    if (!dirs.includes(path)) {
                        dirs.push(path);
                        settings.set_strv('roms-base-dirs', dirs);
                        renderFolders();
                    }
                } catch (e) { /* usuário cancelou */ }
            });
        });
        addFolderRow.add_suffix(addBtn);
        addFolderRow.set_activatable_widget(addBtn);

        renderFolders();
        libGroup.add(addFolderRow);

        // Grupo separado: renderFolders() reanexa linhas em libGroup, e o
        // spin ficaria pulando de posição a cada pasta adicionada/removida.
        const limitGroup = new Adw.PreferencesGroup();
        page.add(limitGroup);

        const maxRow = new Adw.SpinRow({
            title: _('Máximo de jogos por emulador'),
            subtitle: _('Limita o tamanho do menu quando há muitas ROMs'),
            adjustment: new Gtk.Adjustment({lower: 5, upper: 200, step_increment: 5, page_increment: 25}),
        });
        settings.bind('max-games-per-app', maxRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        limitGroup.add(maxRow);

        // =================== Página: Emuladores ===================
        const emuPage = new Adw.PreferencesPage({
            title: _('Emuladores'),
            icon_name: 'input-gaming-symbolic',
        });
        window.add(emuPage);

        const emuGroup = new Adw.PreferencesGroup({
            title: _('Mostrar no menu'),
            description: _('Desligue os emuladores que você não usa'),
        });
        emuPage.add(emuGroup);

        for (const [key, title, subtitle] of EMULATOR_ROWS) {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            emuGroup.add(row);
        }
    }
}
