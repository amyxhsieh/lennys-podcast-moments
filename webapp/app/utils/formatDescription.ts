/**
 * Processes and formats episode description text by:
 * - Unescaping unicode characters (\u2019 → ')
 * - Converting \n to actual line breaks
 * - Removing escaped backslashes and extra spaces
 * - Cleaning up formatting
 */
export function formatDescription(description: string): string {
  if (!description) return '';

  let formatted = description;

  // Unescape Unicode characters (e.g., \u2019 → ')
  formatted = formatted.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
    return String.fromCharCode(parseInt(code, 16));
  });

  // Replace \n with actual line breaks (but keep as text for now, will use CSS)
  formatted = formatted.replace(/\\n/g, '\n');

  // Remove escaped backslashes with spaces (\ \ → space)
  formatted = formatted.replace(/\\\s+\\/g, ' ');

  // Remove single escaped backslashes before spaces
  formatted = formatted.replace(/\\\s/g, ' ');

  // Remove any remaining standalone backslashes
  formatted = formatted.replace(/\\/g, '');

  // Clean up multiple spaces
  formatted = formatted.replace(/\s+/g, ' ');

  // Clean up multiple line breaks (more than 2 in a row)
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace
  formatted = formatted.trim();

  return formatted;
}
