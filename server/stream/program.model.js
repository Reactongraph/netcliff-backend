const mongoose = require('mongoose');

const programSchema = new mongoose.Schema({
    streamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Stream',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    start: {
        type: Date,
        required: true
    },
    end: {
        type: Date,
        required: true
    },
    allDay: {
        type: Boolean,
        default: false
    },
    recurring: {
        type: Boolean,
        default: false
    },
    recurrence: {
        frequency: {
            type: String,
            enum: ['DAILY', 'WEEKLY', 'MONTHLY'],
            default: 'WEEKLY'
        },
        interval: {
            type: Number,
            default: 1
        },
        count: {
            type: Number,
            default: 1
        }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Program', programSchema);
