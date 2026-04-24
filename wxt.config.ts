import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Sierra',
    description:
      'Capture kit for AI article writers — record any click-through and hand the annotated bundle to your AI agent.',
    permissions: ['activeTab', 'storage', 'tabs'],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Sierra' },
    web_accessible_resources: [
      { resources: ['editor.html'], matches: ['<all_urls>'] },
    ],
  },
});
