import React from 'react'
import type { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span style={{fontWeight: 700}}>🔮 Ouroboros Docs</span>,
  project: { link: 'https://github.com' },
  docsRepositoryBase: 'https://github.com/ouroboros/docs',
  footer: { content: 'Ouroboros MCP — AI Workflow Platform' },
  darkMode: true,
  sidebar: { defaultMenuCollapseLevel: 1 },
  toc: { title: '목차' },
  editLink: { content: '' },
  feedback: { content: null },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="Ouroboros Docs" />
    </>
  ),
}

export default config
