import { Redirect } from 'expo-router';

// Complaints page has been moved into the tab layout so the bottom bar stays visible.
// All existing push/replace calls to '/complaints' will land here and get redirected.
export default function ComplaintsRedirect() {
    return <Redirect href="/(tabs)/complaints" />;
}
