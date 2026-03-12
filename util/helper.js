// Format channel name for AWS Stack Name requirements
exports.userRoles = {
    USER: 'USER',
    ADMIN: 'ADMIN',
    ANONYMOUS: 'ANONYMOUS'
}
exports.recordStatus = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', DELETED: 'DELETED' }

exports.formatStackName = (channelName) => {
    return channelName
        // Replace spaces and special characters with hyphens
        .replace(/[^a-zA-Z0-9-]/g, '-')
        // Replace multiple consecutive hyphens with single hyphen
        .replace(/-+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '')
        // Ensure it starts with a letter (if it doesn't, prepend 'ch-')
        .replace(/^(?![a-zA-Z])/, 'ch-');
};