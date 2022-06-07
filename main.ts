import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

const util = require('util');
const exec = util.promisify(require('child_process').exec);


var pretty = require('pretty');



interface ObsHtmlPluginSettings {
	config_abs_path: string;
	export_folder_path: string;
	run_obsidianhtml_after_export: boolean;
	cwd: string;
}

const DEFAULT_SETTINGS: ObsHtmlPluginSettings = {
	config_abs_path: '',
	export_folder_path: 'obs.html/export',
	run_obsidianhtml_after_export: false,
	cwd: ''
}

export default class ObsHtmlPlugin extends Plugin {
	settings: ObsHtmlPluginSettings;
	
	// PROGRAM ATTRIBUTES
	// ----------------------------------------------------------------------------------------------
	plugin_name = "[obs.html companion]";

	// GLOBALS
	// ----------------------------------------------------------------------------------------------
	basePath = (this.app.vault.adapter as any).basePath
	
	// GENERAL FUNCTIONS
	// ----------------------------------------------------------------------------------------------

	flash(message: string, timeout?: any){
		new Notice(this.plugin_name + ' ' + message, timeout);
	}

	get_file_or_folder(path: string){
		const tfile = this.app.vault.getAbstractFileByPath(path)
		if (tfile){
			return tfile
		}
		return false
	}

	async overwrite(path: string, data: string){

		// create folder if not exists
		const folder_path = path.split('/').slice(0, -1).join('/')

		let tfolder = this.app.vault.getAbstractFileByPath(folder_path)
		if (!tfolder){
			console.log(tfolder)
			console.log(`Folder ${folder_path} does not yet exist, creating... (parent: ${path})`)
			await this.app.vault.createFolder(folder_path)
		}

		// delete file if exists
		const tfile = this.get_file_or_folder(path)
		if (tfile){
			await this.app.vault.delete(tfile)
		}

		// create file
		await this.app.vault.create(path, data)

		return true
	}


	async create_folder_if_not_exist(path: string){
		const tfolder = this.get_file_or_folder(path)
		if (!tfolder){
			console.log('creating folder '+path)
			await this.app.vault.createFolder(path)
			return true
		}
		return false
	}


	// COMMAND FUNCTIONS
	// ----------------------------------------------------------------------------------------------
	async export_html(){
		const files = this.app.vault.getMarkdownFiles();
		const leaf = this.app.workspace.activeLeaf;

		// save view state so that we can restore it at the end
		const orViewState = this.app.workspace.activeLeaf.getViewState()
		console.log(orViewState); 

		this.flash('Exporting files, hang on...', 5000);

		// loop over each markdown file in Vault
		for(let i = 0; i < files.length; i++){
			console.log('------------', files[i].path)

			// don't handle files in the export folder
			if (isIn(this.settings.export_folder_path, files[i].path)){
				console.log('\t skipped')
				continue;
			}

			// open file in editor and coerce view mode so that the html is generated
			await leaf.openFile(files[i])
			let vs = this.app.workspace.activeLeaf.getViewState()
			vs.state.mode = 'preview'
			await this.app.workspace.activeLeaf.setViewState(vs)

			// get html
			await sleep(50); // if someone knows the event for "html loading done", please let me know lol.
			const html_el = this.app.workspace.containerEl.getElementsByClassName('markdown-preview-section')[0]
			let html = html_el.innerHTML;

			let retries = 0
			while(!html && retries < 5){
				console.log(`try ${retries}`)
				await sleep(100);
				html = html_el.innerHTML;
			}
			if (!html){
				this.flash(`Error: returned html is empty for ${files[i].path}`);
			}

			// write html to export folder
			const export_path = `${this.settings.export_folder_path}/${files[i].path}.html`
			await this.overwrite(export_path, pretty(html));
		}

		// restore original viewstate

		this.app.workspace.activeLeaf.setViewState(orViewState);

		this.flash('Export done');

		if (this.settings.run_obsidianhtml_after_export){
			this.run_obsidianhtml()
		}
	}

	async test(){
		this.flash('100', 100)
		this.flash('1000', 1000)
		this.flash('5000', 5000)
		const { stdout, stderr } = await exec('firefox http://localhost:8000');
	}

	async run_obsidianhtml(){
		this.flash("Running ObsidianHtml... (You'll get notified when it's done)", 7000);

		// compile command
		const cwd = this.settings.cwd
		const config_abs_path = this.settings.config_abs_path
		const command = `cd "${cwd}"; obsidianhtml -i "${config_abs_path}"`
		console.log(command)

		// run command
		const { stdout, stderr } = await exec(command);
		
		// handle result
		if (stderr){
			console.error('stderr:', stderr);
			this.flash('Running ObsidianHtml --> failed!', 5000)
		}
		else if (stdout){
			console.log('stdout:', stdout);
			this.flash('Running ObsidianHtml --> done!', 5000)
		}
		else {
			this.flash('Running ObsidianHtml --> failed!', 5000)
		}
	}

	async dump_file_list(type: string){
		let files;
		if (type == 'markdown'){
			files = this.app.vault.getMarkdownFiles()
		} else {
			files = this.app.vault.getFiles()
		}

		let files_simple = []
		for (let i = 0; i < files.length; i++) {  
			console.log(files[i].path);
			files_simple.push(files[i].path)
		}
		const export_path = `${this.settings.export_folder_path}/${type}_files.json`
		console.log(export_path)
		await this.overwrite(export_path, JSON.stringify(files_simple, null, 4))

		this.flash(`Wrote list of ${type} files to ${this.basePath}/${export_path}`)

	}

	// MAIN FUNCTIONS
	// ----------------------------------------------------------------------------------------------

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		// let icons = ['logo-crystal', 'create-new', 'trash', 'search', 'right-triangle', 'document', 'folder', 'pencil', 'left-arrow', 'right-arrow', 'three-horizontal-bars', 'dot-network', 'audio-file', 'image-file', 'pdf-file', 'gear', 'documents', 'blocks', 'go-to-file', 'presentation', 'cross-in-box', 'microphone', 'microphone-filled', 'two-columns', 'link', 'popup-open', 'checkmark', 'hashtag', 'left-arrow-with-tail', 'right-arrow-with-tail', 'lines-of-text', 'vertical-three-dots', 'pin', 'magnifying-glass', 'info', 'horizontal-split', 'vertical-split', 'calendar-with-checkmark', 'sheets-in-box', 'up-and-down-arrows', 'broken-link', 'cross', 'any-key', 'reset', 'star', 'crossed-star', 'dice', 'filled-pin', 'enter', 'help', 'vault', 'open-vault', 'paper-plane', 'bullet-list', 'uppercase-lowercase-a', 'star-list', 'expand-vertically', 'languages', 'switch', 'pane-layout', 'install']
		const ribbonIconEl = this.addRibbonIcon('paper-plane', `${this.plugin_name} Export html`, (evt: MouseEvent) => {
			this.export_html();
			//this.test()
		});
		
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		this.addCommand({
			id: 'list-markdown-files',
			name: 'Export list of all markdown files to export folder',
			callback: async () => {
				this.dump_file_list('markdown')
			}
		});

		this.addCommand({
			id: 'list-all-files',
			name: 'Export list of all files to export folder',
			callback: () => {
				this.dump_file_list('all')
			}
		});


		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}



class SampleSettingTab extends PluginSettingTab {
	plugin: ObsHtmlPlugin;

	constructor(app: App, plugin: ObsHtmlPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Obs.html settings'});

		new Setting(containerEl)
			.setName('Export folder')
			.setDesc('This is the folder path (relative to your vault root) where all the html files will be placed.')
			.addText(text => text
				.setValue(this.plugin.settings.export_folder_path)
				.onChange(async (value) => {
					this.plugin.settings.export_folder_path = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Run obsidianhtml after export?')
			.addToggle((t) => {
				t.setValue(this.plugin.settings.run_obsidianhtml_after_export)
				.onChange(async(v: boolean) => {
					this.plugin.settings.run_obsidianhtml_after_export = v; 
					console.log(this.plugin.settings.run_obsidianhtml_after_export)
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
		.setName('Config.yml path')
		.setDesc('The *absolute* path to your config.yml file')
		.addText(text => text
			.setPlaceholder('Enter your path')
			.setValue(this.plugin.settings.config_abs_path)
			.onChange(async (value) => {
				console.log('config.yml path: ' + value);
				this.plugin.settings.config_abs_path = value;
				await this.plugin.saveSettings();
			}));

			new Setting(containerEl)
			.setName('Working directory')
			.setDesc('Which folder do you want to run obsidianhtml from?')
			.addText(text => text
				.setPlaceholder('Enter your path')
				.setValue(this.plugin.settings.cwd)
				.onChange(async (value) => {
					console.log('cwd path: ' + value);
					this.plugin.settings.cwd = value;
					await this.plugin.saveSettings();
				}));
	}
}


function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isIn(root: string, path: string){
	const root_parts = root.split('/')
	const path_parts = path.split('/')

	if (root_parts.length > path_parts.length){
		return false
	}

	for (let i = 0; i < root_parts.length; i++){
		if (root_parts[i] != path_parts[i]){
			return false
		}
	}

	return true
}