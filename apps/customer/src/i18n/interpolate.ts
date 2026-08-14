export function interpolateTranslation(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) {
    return template;
  }

  let result = template;
  Object.entries(params).forEach(([paramKey, paramValue]) => {
    result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
  });

  return result;
}
