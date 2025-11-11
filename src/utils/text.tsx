import TrackedLink from '../components/TrackedLink';

// Helper function to render issue text with clickable links
export const renderIssueWithLinks = (text: string, index: number) => {
  // Match URLs in the text (http:// or https://)
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const parts = text.split(urlRegex);

  return (
    <li key={index}>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <TrackedLink
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
            >
              {part}
            </TrackedLink>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </li>
  );
};
