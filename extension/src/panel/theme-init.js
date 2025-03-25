// Initialize theme from localStorage
(function() {
  // Check if user has a saved theme preference
  const savedTheme = localStorage.getItem('theme');
  // Apply dark theme if saved, otherwise use light theme (default)
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  }
})(); 