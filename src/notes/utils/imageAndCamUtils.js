import { Alert, PermissionsAndroid, Platform } from 'react-native';
import ImagePicker from 'react-native-image-crop-picker';
import { check, PERMISSIONS, request, RESULTS } from 'react-native-permissions';

// Request Camera Permission
const requestCameraPermission = async () => {
  try {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'This app needs camera access to take photos',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } else {
      const status = await check(PERMISSIONS.IOS.CAMERA);
      if (status === RESULTS.GRANTED) return true;
      const requestResult = await request(PERMISSIONS.IOS.CAMERA);
      return requestResult === RESULTS.GRANTED;
    }
  } catch (err) {
    console.warn(err);
    return false;
  }
};

// Request Storage Permission
const requestStoragePermission = async () => {
  try {
    if (Platform.OS === 'android') {
      const permission =
        Platform.Version >= 33
          ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

      const granted = await PermissionsAndroid.request(permission, {
        title: 'Storage Permission',
        message: 'This app needs storage access to select photos',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      });
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true; // iOS doesn't require storage permission for image picker
  } catch (err) {
    console.warn(err);
    return false;
  }
};

// Open Camera
// export const openCamera = async () => {
//   const hasPermission = await requestCameraPermission();
//   if (!hasPermission) {
//     Alert.alert('Permission required', 'Camera permission is needed to take photos');
//     return null;
//   }

//   const options = { mediaType: 'photo', quality: 1, saveToPhotos: true };

//   return new Promise((resolve, reject) => {
//     launchCamera(options, (response) => {
//       if (response.didCancel) {
//         console.log('User cancelled camera');
//         resolve(null);
//       } else if (response.errorCode) {
//         console.log('Camera Error: ', response.errorMessage);
//         reject(response.errorMessage);
//       } else if (response.assets?.length > 0) {
//         resolve(response.assets[0].uri);
//       } else {
//         resolve(null);
//       }
//     });
//   });
// };
// Open Camera. Cropping is deliberately off here: the picker's own cropper is
// rectangle-only, and the shot goes through QuadCropperModal instead, which can
// take any four-sided selection.
export const openCamera = async () => {
  const hasPermission = await requestCameraPermission();
  if (!hasPermission) {
    Alert.alert('Permission required', 'Camera permission is needed to take photos');
    return null;
  }

  try {
    const image = await ImagePicker.openCamera({
      cropping: false,
      compressImageQuality: 0.8,
      // Matches the cropper's own working cap, so a 12MP shot doesn't cross
      // the bridge as several MB of base64 only to be scaled down anyway.
      compressImageMaxWidth: 2600,
      compressImageMaxHeight: 2600,
      mediaType: 'photo',
      includeBase64: true,
    });

    return image
  } catch (error) {
    if (error.code !== 'E_PICKER_CANCELLED') {
      console.log('Camera Error: ', error.message);
      Alert.alert('Error', 'Failed to capture image');
    }
    return null;
  }
};
// Pick Image from Gallery
// export const pickImage = async () => {
//   const hasPermission = await requestStoragePermission();
//   if (!hasPermission) {
//     Alert.alert('Permission required', 'Storage permission is needed to access photos');
//     return null;
//   }

// //   const options = { mediaType: 'photo', quality: 1, selectionLimit: 1 };
// const options = {
//     mediaType: 'mixed', // Ensures we only pick images
//     quality: 1,         // High quality images
//     includeBase64: false, // Prevents large memory usage
//     selectionLimit: 0,   // 0 = Unlimited images
//   };

//   return new Promise((resolve, reject) => {
//     launchImageLibrary(options, (response) => {
//       if (response.didCancel) {
//         console.log('User cancelled image picker');
//         resolve(null);
//       } else if (response.errorCode) {
//         console.log('ImagePicker Error: ', response.errorMessage);
//         reject(response.errorMessage);
//       } else if (response.assets?.length > 0) {
//         // Return an array of selected image URIs
//         const uris = response.assets.map(asset => asset.uri);
//         resolve(uris);
//       } else {
//         resolve(null);
//       }
//     });
//   });
// };
// Pick Images from Gallery. Same as above - the images come back untouched and
// are cropped afterwards in QuadCropperModal.
export const pickImage = async () => {
  const hasPermission = await requestStoragePermission();
  if (!hasPermission) {
    Alert.alert('Permission required', 'Storage permission is needed to access photos');
    return null;
  }

  try {
    const images = await ImagePicker.openPicker({
      cropping: false,
      compressImageQuality: 0.8,
      // Matches the cropper's own working cap, so a 12MP shot doesn't cross
      // the bridge as several MB of base64 only to be scaled down anyway.
      compressImageMaxWidth: 2600,
      compressImageMaxHeight: 2600,
      mediaType: 'photo',
      multiple: true,
      maxFiles: 10,
      includeBase64: true,
      // smartAlbums: [
      //   'UserLibrary',
      //   'PhotoStream',
      //   'Panoramas',
      //   'Videos',
      //   'Bursts'
      // ], // iOS only
    });
console.log(images)
    // Return array of paths for all selected images
    // return images?.map(img => img.path) || null;
    return images

  } catch (error) {
    if (error.code !== 'E_PICKER_CANCELLED') {
      console.log('ImagePicker Error: ', error.message);
      Alert.alert('Error', 'Failed to select images');
    }
    return null;
  }
};