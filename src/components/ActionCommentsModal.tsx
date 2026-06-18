import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
} from 'react-native';

type Props = {
    visible: boolean;
    title: string;
    actionType: 'approve' | 'reject' | 'revoke' | 'neutral';
    placeholder?: string;
    onSubmit: (comments: string) => void;
    onClose: () => void;
};

export function ActionCommentsModal({
    visible,
    title,
    actionType,
    placeholder = 'Enter remarks...',
    onSubmit,
    onClose,
}: Props) {
    const [comments, setComments] = useState('');

    const handleSubmit = () => {
        onSubmit(comments);
        setComments('');
    };

    const handleClose = () => {
        setComments('');
        onClose();
    };

    const actionColors = {
        approve: { bg: 'bg-emerald-600', text: 'text-white' },
        reject: { bg: 'bg-rose-600', text: 'text-white' },
        revoke: { bg: 'bg-amber-600', text: 'text-white' },
        neutral: { bg: 'bg-neutral-900', text: 'text-white' },
    };

    const colors = actionColors[actionType] || actionColors.neutral;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View className="flex-1 justify-end bg-black/40">
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        className="w-full"
                    >
                        <View className="rounded-t-3xl border border-neutral-100 bg-white px-6 pb-8 pt-6 shadow-2xl">
                            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-neutral-200" />
                            <Text className="text-lg font-black text-neutral-900 mb-2">{title}</Text>
                            
                            <TextInput
                                value={comments}
                                onChangeText={setComments}
                                placeholder={placeholder}
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={3}
                                className="min-h-[96px] w-full rounded-2xl border-2 border-neutral-100 bg-neutral-50 px-4 py-3 text-sm text-neutral-800 font-medium mb-6"
                                textAlignVertical="top"
                            />

                            <View className="flex-row gap-3">
                                <TouchableOpacity
                                    onPress={handleClose}
                                    className="flex-1 items-center rounded-2xl border-2 border-neutral-200 bg-white py-3.5"
                                >
                                    <Text className="text-xs font-black uppercase tracking-widest text-neutral-500">Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleSubmit}
                                    className={`flex-1 items-center rounded-2xl py-3.5 ${colors.bg}`}
                                >
                                    <Text className="text-xs font-black uppercase tracking-widest text-white">Confirm</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}
