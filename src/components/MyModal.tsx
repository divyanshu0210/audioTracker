import {
    Modal as RNModal,
    ModalProps,
    KeyboardAvoidingView,
    View,
    Platform,
    StyleSheet,
  } from 'react-native';
  
  type PROPS = ModalProps & {
    isOpen: boolean;
    withInput?: boolean;
  };
  
   const MyModal = ({ isOpen, withInput, children, ...rest }: PROPS) => {
    const content = withInput ? (
      <KeyboardAvoidingView
        style={styles.keyboardStyle}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {children}
      </KeyboardAvoidingView>
    ) : (
      <View
        style={styles.container}
      >
        {children}
      </View>
    );
  
    return (
      <RNModal
        visible={isOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        {...rest}
      >
        {content}
      </RNModal>
    );
  };
  
  export default MyModal; 
  
  const styles = StyleSheet.create({
    keyboardStyle:{
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        paddingHorizontal: 12, // px-3 is equivalent to 12 pixels
        backgroundColor: 'rgba(24, 24, 27, 0.4)', // Equivalent to bg-zinc-900/40

    },
    container:{
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(24, 24, 27, 0.4)',
    }
  })