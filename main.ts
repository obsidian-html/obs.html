import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { exec } from 'child_process';


interface ObsHtmlPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: ObsHtmlPluginSettings = {
	mySetting: 'default'
}

export default class ObsHtmlPlugin extends Plugin {
	settings: ObsHtmlPluginSettings;
	
	// PROGRAM ATTRIBUTES
	// ----------------------------------------------------------------------------------------------
	
	plugin_name = "[obs.html companion]";
	export_folder_path = 'obs.html/export';

	
	// GENERAL FUNCTIONS
	// ----------------------------------------------------------------------------------------------

	flash(message: string){
		new Notice(this.plugin_name + ' ' + message);
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

	run_shell(command: string, callback?: any){
		const basePath = (this.app.vault.adapter as any).basePath

		exec(command, (error, stdout, stderr) => {
			if (error) {
				console.log(`error: ${error.message}`);
			}
			if (stderr) {
				console.log(`stderr: ${stderr}`);
			}
			console.log(`stdout: ${stdout}`);
			
			if (callback){
				callback(stdout, stderr, error)
			}
		});
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

		// loop over each markdown file in Vault
		for(let i = 0; i < files.length; i++){
			console.log('------------', files[i].path)

			// don't handle files in the export folder
			if (isIn(this.export_folder_path, files[i].path)){
				console.log('\t skipped')
				continue;
			}

			// open file in editor and coerce view mode so that the html is generated
			await leaf.openFile(files[i])
			let vs = this.app.workspace.activeLeaf.getViewState()
			vs.state.mode = 'preview'
			await this.app.workspace.activeLeaf.setViewState(vs)

			// get html
			await sleep(10); // if someone knows the event for "html loading done", please let me know lol.
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
			const export_path = `${this.export_folder_path}/${files[i].path}.html`
			let res = this.overwrite(export_path, html)
			console.log(res)
			await res
		}

		// restore original viewstate
		this.app.workspace.activeLeaf.setViewState(orViewState);

		this.flash('Export done');
	}

	// MAIN FUNCTIONS
	// ----------------------------------------------------------------------------------------------

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			//this.create_export_folder();
			this.export_html();
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		this.addCommand({
			id: 'list-markdown-files',
			name: 'List all markdown files',
			callback: () => {
				const files = this.app.vault.getMarkdownFiles()
				for (let i = 0; i < files.length; i++) {  
					console.log(files[i].path);
				}
			}
		});

		this.addCommand({
			id: 'list-all-files',
			name: 'List all files',
			callback: () => {
				const files = this.app.vault.getFiles()
				for (let i = 0; i < files.length; i++) {  
					console.log(files[i].path);
				}
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
















class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
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

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
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