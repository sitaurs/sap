import { enc, query, r1Get, r1Mutate, type R1 } from "./r1";
import type {
  Activity,
  ActivityInput,
  ActivityMember,
  MemberStatus,
  ResultInput,
  ActivityResult,
} from "./activities";
import { uploadEvidence } from "./community";
export const manageActivity = (id: string, signal?: AbortSignal) =>
  r1Get<Activity>(`/activities/${enc(id)}/manage`, signal);
export const coordinatorMembers = {
  getActivity: manageActivity,
  listMembers: (
    id: string,
    status?: MemberStatus,
    cursor?: string,
    signal?: AbortSignal,
  ) =>
    r1Get<R1["ManagedMembershipPage"]>(
      `/activities/${enc(id)}/memberships?${query({ limit: 20, status, cursor })}`,
      signal,
    ),
  decideMember: (
    current: ActivityMember,
    status: "accepted" | "waitlisted" | "rejected" | "cancelled",
    reason: string,
  ) =>
    r1Mutate<ActivityMember>(
      "PATCH",
      `/activities/${enc(current.activityId)}/memberships/${enc(current.id)}`,
      { status, reason },
      current.revision,
    ),
  recordAttendance: (
    current: ActivityMember,
    attendance: ActivityMember["attendance"],
  ) =>
    r1Mutate<ActivityMember>(
      "PUT",
      `/activities/${enc(current.activityId)}/memberships/${enc(current.id)}/attendance`,
      { attendance },
      current.revision,
    ),
};
export const coordinatorEdit = (activity: Activity, body: ActivityInput) =>
  r1Mutate<Activity>(
    "PATCH",
    `/activities/${enc(activity.id)}`,
    body,
    activity.revision,
  );
export const coordinatorCommand = (
  activity: Activity,
  action: R1["ActivityCommandInput"]["action"],
  reason: string | null,
  key: string,
) =>
  r1Mutate<Activity>(
    "POST",
    `/activities/${enc(activity.id)}/commands`,
    { action, reason },
    activity.revision,
    key,
  );
export const coordinatorResult = (
  activityId: string,
  id: string,
  signal?: AbortSignal,
) =>
  r1Get<ActivityResult>(
    `/activities/${enc(activityId)}/results/${enc(id)}`,
    signal,
  );
export const coordinatorResultGateway = (activityId: string) => ({
  getActivityResult: (id: string, signal?: AbortSignal) =>
    coordinatorResult(activityId, id, signal),
  uploadActivityPhoto: (file: File) =>
    uploadEvidence(file, "activity_evidence"),
  submitActivityResult: (
    current: Activity,
    body: ResultInput,
    key: string,
    previous?: ActivityResult,
  ) =>
    previous
      ? r1Mutate<ActivityResult>(
          "PATCH",
          `/activities/${enc(current.id)}/results/${enc(previous.id)}`,
          body,
          previous.revision,
        )
      : r1Mutate<ActivityResult>(
          "POST",
          `/activities/${enc(current.id)}/results`,
          body,
          undefined,
          key,
        ),
});
