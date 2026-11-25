export function withRelease(action, args, release) {
  const callbackIndex = args.findIndex((value) => typeof value === "function");
  if (callbackIndex >= 0) {
    const nextArgs = [...args];
    const callback = nextArgs[callbackIndex];
    nextArgs[callbackIndex] = (...values) => {
      release();
      callback(...values);
    };
    return action(...nextArgs);
  }
  const result = action(...args);
  return result && typeof result.finally === "function"
    ? result.finally(release)
    : result;
}

export function withFailureRelease(action, args, release) {
  const callbackIndex = args.findIndex((value) => typeof value === "function");
  if (callbackIndex >= 0) {
    const nextArgs = [...args];
    const callback = nextArgs[callbackIndex];
    nextArgs[callbackIndex] = (error, ...values) => {
      if (error != null) release();
      callback(error, ...values);
    };
    return action(...nextArgs);
  }
  try {
    const result = action(...args);
    return result && typeof result.catch === "function"
      ? result.catch((error) => {
          release();
          throw error;
        })
      : result;
  } catch (error) {
    release();
    throw error;
  }
}
