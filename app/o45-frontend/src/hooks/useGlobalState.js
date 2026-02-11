const user = ref(null);
export function useUser() {
    return {
        user,
        setUser(newUser) {
            user.value = newUser;
        }
    };
}
