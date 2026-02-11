export const useValidPhone = str => {
    return /^1(\d){10}$/.test(str);
};
export const useValidEmail = str => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(str);
};
