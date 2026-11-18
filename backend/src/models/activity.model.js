import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // UTC date string makes calendar-window aggregation explicit and predictable.
    activityDate: {
      type: String,
      required: true,
    },
    lastSeenAt: {
      type: Date,
      required: true,
    },
    eventTypes: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

activitySchema.index({ userId: 1, activityDate: 1 }, { unique: true });
activitySchema.index({ activityDate: 1, userId: 1 });

const Activity = mongoose.model("Activity", activitySchema);
export default Activity;
