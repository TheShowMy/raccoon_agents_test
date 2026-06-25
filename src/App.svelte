<script>
  import Layout from './lib/components/Layout.svelte';
</script>

<Layout
  showHeader={true}
  headerTitle="子页面列表"
  headerSubtitle="浏览所有示例页面"
  showBackNav={false}
  showFooter={true}
  footerText="子页面列表 · 点击卡片进入对应页面"
>
  <p style="text-align: center; color: var(--text-secondary);">
    内容区域 — 后续任务将在此渲染子页面卡片
  </p>
</Layout>
