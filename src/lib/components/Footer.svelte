<script>
  /** Page footer with configurable text */
  export let text = '';
</script>

<footer class="footer">
  <p>{text}</p>
</footer>

<style>
  .footer {
    padding: 1.25rem 1.5rem;
    text-align: center;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-muted);
    font-size: 0.8rem;
  }
</style>
