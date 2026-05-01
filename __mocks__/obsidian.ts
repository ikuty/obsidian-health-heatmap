export const requestUrl = jest.fn();

export class Plugin {
  loadData = jest.fn().mockResolvedValue(null);
  saveData = jest.fn().mockResolvedValue(undefined);
}

export class Notice {
  constructor(public message: string) {}
}

export class MarkdownRenderChild {
  containerEl: HTMLElement;
  constructor(el: HTMLElement) {
    this.containerEl = el;
  }
  onload() {}
  onunload() {}
}

export class PluginSettingTab {
  containerEl = {
    empty: jest.fn(),
    createEl: jest.fn().mockReturnValue({ createEl: jest.fn() }),
  } as unknown as HTMLElement;
  constructor(public app: unknown, public plugin: unknown) {}
  display() {}
}

export class Setting {
  constructor(public containerEl: unknown) {}
  setName = jest.fn().mockReturnThis();
  setDesc = jest.fn().mockReturnThis();
  addText = jest.fn().mockReturnThis();
  addSlider = jest.fn().mockReturnThis();
  addButton = jest.fn().mockReturnThis();
  addDropdown = jest.fn().mockReturnThis();
}
