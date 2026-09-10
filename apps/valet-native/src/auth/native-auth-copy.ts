import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";
import { getNativePlatformCopy } from "../i18n/native-platform-copy";

export interface NativeAuthCopy {
  readonly authenticated: string;
  readonly connectionIssue: string;
  readonly email: string;
  readonly fatal: string;
  readonly fatalTitle: string;
  readonly login: string;
  readonly loginFailed: string;
  readonly logout: string;
  readonly password: string;
  readonly restoring: string;
  readonly retry: string;
  readonly retrying: string;
  readonly signingIn: string;
  readonly staffSignIn: string;
  readonly transient: string;
}

export function getNativeAuthCopy(locale: FoundationLocale): NativeAuthCopy {
  const d = getNativeEmployeeDictionary(locale);
  const platform = getNativePlatformCopy(locale).auth;
  return {
    authenticated: platform.authenticated,
    connectionIssue: d.connectionIssue,
    email: d.workEmail,
    fatal: platform.fatal,
    fatalTitle: platform.fatalTitle,
    login: d.signIn,
    loginFailed: d.operationFailed,
    logout: d.signOut,
    password: d.password,
    restoring: d.checkingSession,
    retry: d.retry,
    retrying: d.retrying,
    signingIn: d.signingIn,
    staffSignIn: d.staffSignIn,
    transient: d.signInUnavailable,
  };
}
