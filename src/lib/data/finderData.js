/**
 * Static file tree data for the Finder application.
 * Each entry: { name, isFolder, children? }
 */

/**
 * @param {string} name
 * @param {import('./finderData.js').FinderEntry[]} children
 * @returns {import('./finderData.js').FinderEntry}
 */
function folder(name, children = []) {
  return { name, isFolder: true, children };
}

/**
 * @param {string} name
 * @returns {import('./finderData.js').FinderEntry}
 */
function file(name) {
  return { name, isFolder: false };
}

/**
 * @typedef {{ name: string, isFolder: boolean, children?: FinderEntry[] }} FinderEntry
 */

/** Root-level file tree */
export const ROOT_FOLDER = folder('Macintosh HD', [
  folder('Applications', [
    file('Safari.app'),
    file('Mail.app'),
    file('备忘录.app'),
    file('日历.app'),
    file('终端.app'),
    file('访达.app'),
  ]),
  folder('Desktop', [
    file('readme.txt'),
    file('screenshot.png'),
    file('project-notes.md'),
  ]),
  folder('Documents', [
    file('项目计划.docx'),
    file('会议纪要.txt'),
    file('预算表.xlsx'),
    folder('工作文档', [
      file('周报.md'),
      file('年度总结.pdf'),
    ]),
    folder('个人', [
      file('日记.txt'),
    ]),
  ]),
  folder('Downloads', [
    file('node-v20.pkg'),
    file('sample.pdf'),
    file('archive.tar.gz'),
  ]),
  folder('Pictures', [
    file('wallpaper.jpg'),
    file('photo-001.png'),
    file('photo-002.png'),
    folder('Screenshots', [
      file('screen_2025-01-01.png'),
    ]),
  ]),
  folder('Music', [
    file('playlist.m3u'),
    folder('Albums', []),
  ]),
  folder('Movies', [
    file('demo.mp4'),
    file('tutorial.mov'),
  ]),
]);

/**
 * Sidebar shortcut definitions.
 * Each item: { label, path (array of folder names from root), icon }
 */
export const SIDEBAR_FAVORITES = [
  { label: 'Macintosh HD', path: [] },
  { label: 'Applications', path: ['Applications'] },
  { label: 'Desktop',      path: ['Desktop'] },
  { label: 'Documents',    path: ['Documents'] },
  { label: 'Downloads',    path: ['Downloads'] },
];

export const SIDEBAR_TAGS = [
  { label: '红色', color: '#ff3b30' },
  { label: '橙色', color: '#ff9500' },
  { label: '黄色', color: '#ffcc00' },
  { label: '绿色', color: '#34c759' },
  { label: '蓝色', color: '#007aff' },
  { label: '紫色', color: '#af52de' },
];

/**
 * Navigate a path through the tree.
 * @param {FinderEntry} root
 * @param {string[]} path - array of folder names
 * @returns {FinderEntry | null}
 */
export function resolvePath(root, path) {
  let current = root;
  for (const segment of path) {
    if (!current.children) return null;
    const child = current.children.find(c => c.name === segment && c.isFolder);
    if (!child) return null;
    current = child;
  }
  return current;
}
