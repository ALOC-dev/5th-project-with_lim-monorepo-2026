export const formatZodIssues = (
  issues: Array<{ path: PropertyKey[]; message: string }>,
) =>
  issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
