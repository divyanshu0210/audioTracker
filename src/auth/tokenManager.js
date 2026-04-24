import { GoogleSignin } from "@react-native-google-signin/google-signin";

let tokenPromise = null;

export const getGoogleAccessToken = async () => {
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const { accessToken } = await GoogleSignin.getTokens();
      return accessToken;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
};