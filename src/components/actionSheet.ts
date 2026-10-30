/**
 * iOS ActionSheet 辅助：RN 0.88 的 ActionSheetIOS 仅暴露 showActionSheetWithOptions，
 * 此处封装与旧 options() 相同签名的便捷方法。
 */
import { ActionSheetIOS } from 'react-native';

export function showActionSheet(
  title: string,
  message: string,
  options: string[],
  destructiveButtonIndex: number,
  cancelButtonIndex: number,
  onPress: (buttonIndex: number) => void,
): void {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      message,
      options,
      destructiveButtonIndex,
      cancelButtonIndex,
    },
    onPress,
  );
}
