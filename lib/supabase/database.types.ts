
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_log": {
                  Row: {
                    "action": string,"actor_membership_id": string | null,"created_at": string,"entity_id": string,"entity_type": string,"id": string,"metadata": NonNullable<Json>,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_membership_id"?: string | null,"created_at"?: string,"entity_id": string,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"organization_id": string
                  }
                  Update: {
                    "action"?: string,"actor_membership_id"?: string | null,"created_at"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_log_actor_membership_id_organization_id_fkey"
      columns: ["actor_membership_id","organization_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "activity_log_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance": {
                  Row: {
                    "event_id": string,"id": string,"note": string | null,"organization_id": string,"participant_id": string | null,"recorded_at": string,"recorded_by": string | null,"status": Database["public"]['Enums']["attendance_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"id"?: string,"note"?: string | null,"organization_id": string,"participant_id"?: string | null,"recorded_at"?: string,"recorded_by"?: string | null,"status": Database["public"]['Enums']["attendance_status"]
                  }
                  Update: {
                    "event_id"?: string,"id"?: string,"note"?: string | null,"organization_id"?: string,"participant_id"?: string | null,"recorded_at"?: string,"recorded_by"?: string | null,"status"?: Database["public"]['Enums']["attendance_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_event_id_organization_id_fkey"
      columns: ["event_id","organization_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "attendance_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_participant_id_organization_id_fkey"
      columns: ["participant_id","organization_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "attendance_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_channels": {
                  Row: {
                    "created_at": string,"id": string,"kind": Database["public"]['Enums']["chat_channel_kind"],"member_a": string | null,"member_b": string | null,"organization_id": string,"project_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["chat_channel_kind"],"member_a"?: string | null,"member_b"?: string | null,"organization_id": string,"project_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["chat_channel_kind"],"member_a"?: string | null,"member_b"?: string | null,"organization_id"?: string,"project_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_channels_member_a_fkey"
      columns: ["member_a"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_channels_member_b_fkey"
      columns: ["member_b"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_channels_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_channels_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "body": string,"channel_id": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"id": string,"mentions": (string)[],"organization_id": string,"sender_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"channel_id": string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"mentions"?: (string)[],"organization_id": string,"sender_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"channel_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"mentions"?: (string)[],"organization_id"?: string,"sender_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_channel_id_organization_id_fkey"
      columns: ["channel_id","organization_id"]
isOneToOne: false
      referencedRelation: "chat_channels"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "chat_messages_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_reads": {
                  Row: {
                    "channel_id": string,"last_read_at": string,"organization_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel_id": string,"last_read_at"?: string,"organization_id": string,"user_id"?: string
                  }
                  Update: {
                    "channel_id"?: string,"last_read_at"?: string,"organization_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_reads_channel_id_organization_id_fkey"
      columns: ["channel_id","organization_id"]
isOneToOne: false
      referencedRelation: "chat_channels"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "chat_reads_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_reads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"dashboard_layouts": {
                  Row: {
                    "id": string,"layout": NonNullable<Json>,"membership_id": string,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"layout": NonNullable<Json>,"membership_id": string,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "id"?: string,"layout"?: NonNullable<Json>,"membership_id"?: string,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dashboard_layouts_membership_id_organization_id_fkey"
      columns: ["membership_id","organization_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "dashboard_layouts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"discussion_replies": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"deleted_at": string | null,"discussion_id": string,"edited_at": string | null,"id": string,"mentions": (string)[],"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"deleted_at"?: string | null,"discussion_id": string,"edited_at"?: string | null,"id"?: string,"mentions"?: (string)[],"organization_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"discussion_id"?: string,"edited_at"?: string | null,"id"?: string,"mentions"?: (string)[],"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "discussion_replies_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discussion_replies_discussion_id_organization_id_fkey"
      columns: ["discussion_id","organization_id"]
isOneToOne: false
      referencedRelation: "discussions"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "discussion_replies_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"discussions": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"edited_at": string | null,"id": string,"last_activity_at": string,"mentions": (string)[],"organization_id": string,"project_id": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"last_activity_at"?: string,"mentions"?: (string)[],"organization_id": string,"project_id"?: string | null,"title": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"last_activity_at"?: string,"mentions"?: (string)[],"organization_id"?: string,"project_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "discussions_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discussions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "discussions_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "created_at": string,"created_by_role": Database["public"]['Enums']["member_role"] | null,"id": string,"mime_type": string,"name": string,"organization_id": string,"pinned": boolean,"project_id": string | null,"search": unknown,"size_bytes": number,"storage_path": string,"tags": (string)[],"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by_role"?: Database["public"]['Enums']["member_role"] | null,"id"?: string,"mime_type": string,"name": string,"organization_id": string,"pinned"?: boolean,"project_id"?: string | null,"search"?: never,"size_bytes": number,"storage_path": string,"tags"?: (string)[],"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by_role"?: Database["public"]['Enums']["member_role"] | null,"id"?: string,"mime_type"?: string,"name"?: string,"organization_id"?: string,"pinned"?: boolean,"project_id"?: string | null,"search"?: never,"size_bytes"?: number,"storage_path"?: string,"tags"?: (string)[],"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "all_day": boolean,"created_at": string,"created_by": string | null,"created_by_role": Database["public"]['Enums']["member_role"] | null,"description": string | null,"ends_at": string,"id": string,"location": string | null,"organization_id": string,"project_id": string | null,"starts_at": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"created_at"?: string,"created_by"?: string | null,"created_by_role"?: Database["public"]['Enums']["member_role"] | null,"description"?: string | null,"ends_at": string,"id"?: string,"location"?: string | null,"organization_id": string,"project_id"?: string | null,"starts_at": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "all_day"?: boolean,"created_at"?: string,"created_by"?: string | null,"created_by_role"?: Database["public"]['Enums']["member_role"] | null,"description"?: string | null,"ends_at"?: string,"id"?: string,"location"?: string | null,"organization_id"?: string,"project_id"?: string | null,"starts_at"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"fund_allocations": {
                  Row: {
                    "amount_cents": number,"created_at": string,"fund_id": string,"id": string,"label": string,"organization_id": string,"position": number,"project_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"fund_id": string,"id"?: string,"label": string,"organization_id": string,"position"?: number,"project_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"fund_id"?: string,"id"?: string,"label"?: string,"organization_id"?: string,"position"?: number,"project_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fund_allocations_fund_id_organization_id_fkey"
      columns: ["fund_id","organization_id"]
isOneToOne: false
      referencedRelation: "funds"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "fund_allocations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fund_allocations_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"funds": {
                  Row: {
                    "created_at": string,"created_by": string | null,"currency": string,"description": string | null,"id": string,"name": string,"organization_id": string,"project_id": string | null,"total_cents": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string | null,"id"?: string,"name": string,"organization_id": string,"project_id"?: string | null,"total_cents": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string | null,"id"?: string,"name"?: string,"organization_id"?: string,"project_id"?: string | null,"total_cents"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "funds_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "funds_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "funds_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"invitation_projects": {
                  Row: {
                    "created_at": string,"id": string,"invitation_id": string,"organization_id": string,"project_id": string,"role": Database["public"]['Enums']["project_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"invitation_id": string,"organization_id": string,"project_id": string,"role"?: Database["public"]['Enums']["project_role"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"invitation_id"?: string,"organization_id"?: string,"project_id"?: string,"role"?: Database["public"]['Enums']["project_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitation_projects_invitation_id_organization_id_fkey"
      columns: ["invitation_id","organization_id"]
isOneToOne: false
      referencedRelation: "invitations"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "invitation_projects_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitation_projects_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"name": string | null,"organization_id": string,"role": Database["public"]['Enums']["member_role"],"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"name"?: string | null,"organization_id": string,"role"?: Database["public"]['Enums']["member_role"],"token"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"name"?: string | null,"organization_id"?: string,"role"?: Database["public"]['Enums']["member_role"],"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"id": string,"organization_id": string,"photo_path": string | null,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"photo_path"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"photo_path"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_mutes": {
                  Row: {
                    "created_at": string,"id": string,"muted_channel_id": string | null,"muted_user_id": string | null,"organization_id": string,"type": Database["public"]['Enums']["notification_type"] | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"muted_channel_id"?: string | null,"muted_user_id"?: string | null,"organization_id": string,"type"?: Database["public"]['Enums']["notification_type"] | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"muted_channel_id"?: string | null,"muted_user_id"?: string | null,"organization_id"?: string,"type"?: Database["public"]['Enums']["notification_type"] | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_mutes_muted_channel_id_fkey"
      columns: ["muted_channel_id"]
isOneToOne: false
      referencedRelation: "chat_channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_mutes_muted_user_id_fkey"
      columns: ["muted_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_mutes_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_mutes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"data": NonNullable<Json>,"dedupe_key": string | null,"id": string,"organization_id": string,"read_at": string | null,"recipient_id": string,"subject_id": string,"subject_type": string,"type": Database["public"]['Enums']["notification_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key"?: string | null,"id"?: string,"organization_id": string,"read_at"?: string | null,"recipient_id": string,"subject_id": string,"subject_type": string,"type": Database["public"]['Enums']["notification_type"]
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key"?: string | null,"id"?: string,"organization_id"?: string,"read_at"?: string | null,"recipient_id"?: string,"subject_id"?: string,"subject_type"?: string,"type"?: Database["public"]['Enums']["notification_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "accent": string | null,"allow_personal_accent": boolean,"created_at": string,"high_attendance_percent": number,"id": string,"logo_dark_path": string | null,"logo_path": string | null,"low_attendance_percent": number,"name": string,"preset_key": string,"show_illustrations": boolean,"slug": string,"terminology_overrides": NonNullable<Json>,"theme": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "accent"?: string | null,"allow_personal_accent"?: boolean,"created_at"?: string,"high_attendance_percent"?: number,"id"?: string,"logo_dark_path"?: string | null,"logo_path"?: string | null,"low_attendance_percent"?: number,"name": string,"preset_key"?: string,"show_illustrations"?: boolean,"slug": string,"terminology_overrides"?: NonNullable<Json>,"theme"?: NonNullable<Json>
                  }
                  Update: {
                    "accent"?: string | null,"allow_personal_accent"?: boolean,"created_at"?: string,"high_attendance_percent"?: number,"id"?: string,"logo_dark_path"?: string | null,"logo_path"?: string | null,"low_attendance_percent"?: number,"name"?: string,"preset_key"?: string,"show_illustrations"?: boolean,"slug"?: string,"terminology_overrides"?: NonNullable<Json>,"theme"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_preset_key_fkey"
      columns: ["preset_key"]
isOneToOne: false
      referencedRelation: "presets"
      referencedColumns: ["key"]
    }
                  ]
                },"participant_file_events": {
                  Row: {
                    "action": Database["public"]['Enums']["participant_file_action"],"actor_id": string | null,"actor_name": string | null,"created_at": string,"file_id": string,"file_kind": Database["public"]['Enums']["participant_file_kind"],"file_name": string | null,"id": number,"organization_id": string,"participant_id": string | null,"project_id": string | null,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["participant_file_action"],"actor_id"?: string | null,"actor_name"?: string | null,"created_at"?: string,"file_id": string,"file_kind": Database["public"]['Enums']["participant_file_kind"],"file_name"?: string | null,"id"?: never,"organization_id": string,"participant_id"?: string | null,"project_id"?: string | null,"storage_path": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["participant_file_action"],"actor_id"?: string | null,"actor_name"?: string | null,"created_at"?: string,"file_id"?: string,"file_kind"?: Database["public"]['Enums']["participant_file_kind"],"file_name"?: string | null,"id"?: never,"organization_id"?: string,"participant_id"?: string | null,"project_id"?: string | null,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "participant_file_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participant_file_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participant_file_events_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"participant_files": {
                  Row: {
                    "created_at": string,"id": string,"kind": Database["public"]['Enums']["participant_file_kind"],"mime_type": string,"name": string,"organization_id": string,"participant_id": string,"project_id": string,"size_bytes": number,"storage_path": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["participant_file_kind"],"mime_type": string,"name": string,"organization_id": string,"participant_id": string,"project_id": string,"size_bytes": number,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["participant_file_kind"],"mime_type"?: string,"name"?: string,"organization_id"?: string,"participant_id"?: string,"project_id"?: string,"size_bytes"?: number,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "participant_files_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participant_files_participant_id_organization_id_fkey"
      columns: ["participant_id","organization_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "participant_files_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "participant_files_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"participant_programs": {
                  Row: {
                    "created_at": string,"organization_id": string,"participant_id": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"participant_id": string,"project_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"participant_id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "participant_programs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participant_programs_participant_id_organization_id_fkey"
      columns: ["participant_id","organization_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "participant_programs_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"participants": {
                  Row: {
                    "archived_at": string | null,"care_notes": string | null,"created_at": string,"created_by": string | null,"date_of_birth": string | null,"email": string | null,"emergency_contact": string | null,"guardian_name": string | null,"id": string,"name": string,"notes": string | null,"organization_id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"care_notes"?: string | null,"created_at"?: string,"created_by"?: string | null,"date_of_birth"?: string | null,"email"?: string | null,"emergency_contact"?: string | null,"guardian_name"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"organization_id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"care_notes"?: string | null,"created_at"?: string,"created_by"?: string | null,"date_of_birth"?: string | null,"email"?: string | null,"emergency_contact"?: string | null,"guardian_name"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"organization_id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "participants_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participants_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"presets": {
                  Row: {
                    "id": string,"key": string,"labels": NonNullable<Json>,"name": string,"starter_content": NonNullable<Json>,"theme": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"key": string,"labels"?: NonNullable<Json>,"name": string,"starter_content"?: NonNullable<Json>,"theme"?: NonNullable<Json>
                  }
                  Update: {
                    "id"?: string,"key"?: string,"labels"?: NonNullable<Json>,"name"?: string,"starter_content"?: NonNullable<Json>,"theme"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "accent": string | null,"bio": string | null,"calendar_feed_created_at": string | null,"calendar_feed_token_hash": string | null,"created_at": string,"email": string,"full_name": string | null,"id": string,"presence_mode": Database["public"]['Enums']["presence_mode"],"theme_mode": string,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accent"?: string | null,"bio"?: string | null,"calendar_feed_created_at"?: string | null,"calendar_feed_token_hash"?: string | null,"created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"presence_mode"?: Database["public"]['Enums']["presence_mode"],"theme_mode"?: string,"title"?: string | null
                  }
                  Update: {
                    "accent"?: string | null,"bio"?: string | null,"calendar_feed_created_at"?: string | null,"calendar_feed_token_hash"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"presence_mode"?: Database["public"]['Enums']["presence_mode"],"theme_mode"?: string,"title"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"project_first_joins": {
                  Row: {
                    "joined_at": string,"membership_id": string,"organization_id": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "joined_at"?: string,"membership_id": string,"organization_id": string,"project_id": string
                  }
                  Update: {
                    "joined_at"?: string,"membership_id"?: string,"organization_id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_first_joins_membership_id_organization_id_fkey"
      columns: ["membership_id","organization_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "project_first_joins_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_first_joins_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"project_members": {
                  Row: {
                    "created_at": string,"id": string,"membership_id": string,"organization_id": string,"project_id": string,"role": Database["public"]['Enums']["project_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"membership_id": string,"organization_id": string,"project_id": string,"role"?: Database["public"]['Enums']["project_role"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"membership_id"?: string,"organization_id"?: string,"project_id"?: string,"role"?: Database["public"]['Enums']["project_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_members_membership_id_organization_id_fkey"
      columns: ["membership_id","organization_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "project_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_members_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "color": string | null,"created_at": string,"created_by": string | null,"created_by_role": Database["public"]['Enums']["member_role"] | null,"description": string | null,"end_date": string | null,"id": string,"name": string,"organization_id": string,"owner_membership_id": string | null,"start_date": string | null,"status": Database["public"]['Enums']["project_status"],"tracks_participants": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"created_by"?: string | null,"created_by_role"?: Database["public"]['Enums']["member_role"] | null,"description"?: string | null,"end_date"?: string | null,"id"?: string,"name": string,"organization_id": string,"owner_membership_id"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"tracks_participants"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"created_by"?: string | null,"created_by_role"?: Database["public"]['Enums']["member_role"] | null,"description"?: string | null,"end_date"?: string | null,"id"?: string,"name"?: string,"organization_id"?: string,"owner_membership_id"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"tracks_participants"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_owner_membership_id_organization_id_fkey"
      columns: ["owner_membership_id","organization_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"task_assignees": {
                  Row: {
                    "added_by": string | null,"created_at": string,"done_at": string | null,"id": string,"invitation_id": string | null,"kind": Database["public"]['Enums']["task_assignee_kind"],"membership_id": string | null,"organization_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"created_at"?: string,"done_at"?: string | null,"id"?: string,"invitation_id"?: string | null,"kind": Database["public"]['Enums']["task_assignee_kind"],"membership_id"?: string | null,"organization_id": string,"task_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"created_at"?: string,"done_at"?: string | null,"id"?: string,"invitation_id"?: string | null,"kind"?: Database["public"]['Enums']["task_assignee_kind"],"membership_id"?: string | null,"organization_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_assignees_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_assignees_invitation_id_organization_id_fkey"
      columns: ["invitation_id","organization_id"]
isOneToOne: false
      referencedRelation: "invitations"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "task_assignees_membership_id_organization_id_fkey"
      columns: ["membership_id","organization_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "task_assignees_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_assignees_task_id_organization_id_fkey"
      columns: ["task_id","organization_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"task_comments": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"id": string,"mentions": (string)[],"organization_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"mentions"?: (string)[],"organization_id": string,"task_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"mentions"?: (string)[],"organization_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_comments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_comments_task_id_organization_id_fkey"
      columns: ["task_id","organization_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"task_shares": {
                  Row: {
                    "added_by": string | null,"created_at": string,"id": string,"membership_id": string,"organization_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"created_at"?: string,"id"?: string,"membership_id": string,"organization_id": string,"task_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"created_at"?: string,"id"?: string,"membership_id"?: string,"organization_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_shares_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_shares_membership_id_organization_id_fkey"
      columns: ["membership_id","organization_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "task_shares_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_shares_task_id_organization_id_fkey"
      columns: ["task_id","organization_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "claim_limit": number | null,"completed_at": string | null,"completion": Database["public"]['Enums']["task_completion"],"created_at": string,"created_by": string | null,"created_by_role": Database["public"]['Enums']["member_role"] | null,"description": string | null,"due_date": string | null,"hidden": boolean,"id": string,"kind": Database["public"]['Enums']["task_kind"],"needs_assignee": boolean,"organization_id": string,"position": number,"priority": Database["public"]['Enums']["task_priority"],"project_id": string | null,"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claim_limit"?: number | null,"completed_at"?: string | null,"completion"?: Database["public"]['Enums']["task_completion"],"created_at"?: string,"created_by"?: string | null,"created_by_role"?: Database["public"]['Enums']["member_role"] | null,"description"?: string | null,"due_date"?: string | null,"hidden"?: boolean,"id"?: string,"kind"?: Database["public"]['Enums']["task_kind"],"needs_assignee"?: boolean,"organization_id": string,"position"?: number,"priority"?: Database["public"]['Enums']["task_priority"],"project_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "claim_limit"?: number | null,"completed_at"?: string | null,"completion"?: Database["public"]['Enums']["task_completion"],"created_at"?: string,"created_by"?: string | null,"created_by_role"?: Database["public"]['Enums']["member_role"] | null,"description"?: string | null,"due_date"?: string | null,"hidden"?: boolean,"id"?: string,"kind"?: Database["public"]['Enums']["task_kind"],"needs_assignee"?: boolean,"organization_id"?: string,"position"?: number,"priority"?: Database["public"]['Enums']["task_priority"],"project_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_project_id_organization_id_fkey"
      columns: ["project_id","organization_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "token": string }; Returns: string
                           },
"add_participant":
{ Args: { "name": string,"project_id": string }; Returns: string
                           },
"appoint_to_task":
{ Args: { "invitation_id"?: string,"membership_id"?: string,"task_id": string }; Returns: undefined
                           },
"as_user_begin":
{ Args: { "uid": string }; Returns: (string)[]
                           },
"as_user_end":
{ Args: { "saved": (string)[] }; Returns: undefined
                           },
"attendance_rate":
{ Args: { "participant_id": string,"project_id": string }; Returns: {
              "counted": number,"rate": number
            }[]
                           },
"calendar_feed":
{ Args: { "feed_token": string }; Returns: {
              "all_day": boolean,"due_date": string,"ends_at": string,"item_id": string,"item_type": string,"starts_at": string,"title": string,"updated_at": string
            }[]
                           },
"can_add_participant_file":
{ Args: { "participant_id": string,"project_id": string }; Returns: boolean
                           },
"can_appoint":
{ Args: { "target_rank": number,"task_id": string }; Returns: boolean
                           },
"can_delete_participant_file":
{ Args: { "file_id": string }; Returns: boolean
                           },
"can_edit_task":
{ Args: { "task_id": string }; Returns: boolean
                           },
"can_grant_project_role":
{ Args: { "project_id": string,"role": Database["public"]['Enums']["project_role"] }; Returns: boolean
                           },
"can_grant_role":
{ Args: { "org_id": string,"role": Database["public"]['Enums']["member_role"] }; Returns: boolean
                           },
"can_hide_task":
{ Args: { "org_id": string,"project_id": string }; Returns: boolean
                           },
"can_manage_member":
{ Args: { "org_id": string,"role": Database["public"]['Enums']["member_role"] }; Returns: boolean
                           },
"can_manage_participants_in":
{ Args: { "project_id": string }; Returns: boolean
                           },
"can_manage_project_content":
{ Args: { "project_id": string }; Returns: boolean
                           },
"can_read_chat_message":
{ Args: { "channel": string,"sent_at": string }; Returns: boolean
                           },
"can_read_participant_object":
{ Args: { "object_name": string,"object_owner": string,"purpose": string }; Returns: boolean
                           },
"can_record_attendance":
{ Args: { "event_id": string,"participant_id": string }; Returns: boolean
                           },
"can_remove_discussion":
{ Args: { "discussion": string }; Returns: boolean
                           },
"can_share_task":
{ Args: { "task_id": string }; Returns: boolean
                           },
"can_upload_participant_object":
{ Args: { "object_name": string }; Returns: boolean
                           },
"can_use_realtime_topic":
{ Args: { "topic": string }; Returns: boolean
                           },
"can_view_channel":
{ Args: { "channel": string }; Returns: boolean
                           },
"can_view_discussion":
{ Args: { "discussion": string }; Returns: boolean
                           },
"can_view_participant":
{ Args: { "participant_id": string }; Returns: boolean
                           },
"can_view_project":
{ Args: { "project_id": string }; Returns: boolean
                           },
"can_view_session_attendance":
{ Args: { "event_id": string }; Returns: boolean
                           },
"can_view_storage_object":
{ Args: { "object_name": string }; Returns: boolean
                           },
"can_view_task":
{ Args: { "task_id": string }; Returns: boolean
                           },
"chat_channel_people":
{ Args: { "channel": string }; Returns: {
              "user_id": string
            }[]
                           },
"chat_history_start":
{ Args: { "channel": string }; Returns: string
                           },
"claim_task":
{ Args: { "task_id": string }; Returns: undefined
                           },
"create_organization":
{ Args: { "name": string,"preset_key": string }; Returns: {
              "accent": string | null,
"allow_personal_accent": boolean,
"created_at": string,
"high_attendance_percent": number,
"id": string,
"logo_dark_path": string | null,
"logo_path": string | null,
"low_attendance_percent": number,
"name": string,
"preset_key": string,
"show_illustrations": boolean,
"slug": string,
"terminology_overrides": NonNullable<Json>,
"theme": NonNullable<Json>
            }
                          SetofOptions: {
        from: "*"
        to: "organizations"
        isOneToOne: true
        isSetofReturn: false
      } },
"decline_invitation":
{ Args: { "token": string }; Returns: undefined
                           },
"discussion_audience":
{ Args: { "discussion": string }; Returns: {
              "user_id": string
            }[]
                           },
"get_invitation":
{ Args: { "token": string }; Returns: {
              "accepted_at": string,"email": string,"expires_at": string,"organization_name": string,"organization_slug": string,"role": Database["public"]['Enums']["member_role"]
            }[]
                           },
"has_permission":
{ Args: { "org_id": string,"required": Database["public"]['Enums']["member_role"] }; Returns: boolean
                           },
"in_channel":
{ Args: { "channel": string }; Returns: boolean
                           },
"is_member":
{ Args: { "org_id": string }; Returns: boolean
                           },
"is_own_profile_photo":
{ Args: { "object_name": string }; Returns: boolean
                           },
"mark_channel_read":
{ Args: { "channel": string }; Returns: undefined
                           },
"mentions_in":
{ Args: { "body": string,"org": string }; Returns: (string)[]
                           },
"my_chat_channels":
{ Args: { "org": string }; Returns: {
              "id": string,"joined": boolean,"kind": Database["public"]['Enums']["chat_channel_kind"],"last_message_at": string,"muted": boolean,"other_user": string,"project_id": string,"project_name": string,"unread": number
            }[]
                           },
"my_membership_id":
{ Args: { "org_id": string }; Returns: string
                           },
"my_pending_invitations":
{ Args: Record<PropertyKey, never>; Returns: {
              "expires_at": string,"invited_by_name": string,"organization_name": string,"organization_slug": string,"preset_key": string,"project_names": (string)[],"role": Database["public"]['Enums']["member_role"],"token": string
            }[]
                           },
"my_project_rank":
{ Args: { "project_id": string }; Returns: number
                           },
"my_project_ranks":
{ Args: { "org_id": string }; Returns: {
              "project_id": string,"rank": number
            }[]
                           },
"my_rank":
{ Args: { "org_id": string }; Returns: number
                           },
"my_verified_email":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"notification_muted":
{ Args: { "actor": string,"channel": string,"kind": Database["public"]['Enums']["notification_type"],"org": string,"recipient": string }; Returns: boolean
                           },
"notify":
{ Args: { "actor": string,"data"?: Json,"dedupe"?: string,"kind": Database["public"]['Enums']["notification_type"],"org": string,"recipient": string,"subject_id": string,"subject_type": string }; Returns: undefined
                           },
"open_direct_channel":
{ Args: { "org": string,"other": string }; Returns: string
                           },
"open_participant_file":
{ Args: { "download": boolean,"file_id": string }; Returns: {
              "mime_type": string,"name": string,"storage_path": string
            }[]
                           },
"outranked_by_creator":
{ Args: { "creator": string,"creator_role": Database["public"]['Enums']["member_role"],"org_id": string }; Returns: boolean
                           },
"pending_invitees":
{ Args: { "org_id": string }; Returns: {
              "email": string,"id": string,"name": string,"project_id": string
            }[]
                           },
"project_is_active":
{ Args: { "project_id": string }; Returns: boolean
                           },
"project_rank_ceiling":
{ Args: { "role": Database["public"]['Enums']["member_role"] }; Returns: number
                           },
"project_role_for_rank":
{ Args: { "rank": number }; Returns: Database["public"]['Enums']["project_role"]
                           },
"project_role_rank":
{ Args: { "role": Database["public"]['Enums']["project_role"] }; Returns: number
                           },
"queue_my_due_notifications":
{ Args: { "org": string,"today": string }; Returns: undefined
                           },
"recent_projects":
{ Args: { "max_rows"?: number,"org_id": string }; Returns: {
              "color": string,"id": string,"last_activity_at": string,"name": string
            }[]
                           },
"record_participant_file_event":
{ Args: { "f": Omit<Database["public"]['Tables']["participant_files"]['Row'], Database["public"]['Tables']["participant_files"]['ComputedFields']>,"what": Database["public"]['Enums']["participant_file_action"] }; Returns: undefined
                           },
"regenerate_calendar_feed":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"release_program_files":
{ Args: { "project_id": string }; Returns: string[]
                           },
"remove_member":
{ Args: { "membership_id": string,"reassign_to"?: string }; Returns: Json
                           },
"remove_task_assignee":
{ Args: { "invitation_id"?: string,"membership_id"?: string,"task_id": string }; Returns: undefined
                           },
"revoke_calendar_feed":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"role_rank":
{ Args: { "role": Database["public"]['Enums']["member_role"] }; Returns: number
                           },
"send_change_signal":
{ Args: { "org": string,"project": string }; Returns: undefined
                           },
"set_my_photo":
{ Args: { "org_id": string,"path": string }; Returns: string
                           },
"set_task_done":
{ Args: { "done": boolean,"task_id": string }; Returns: Database["public"]['Enums']["task_status"]
                           },
"shares_org":
{ Args: { "other_user": string }; Returns: boolean
                           },
"signal_chat":
{ Args: { "channel": string,"event": string,"recipients": (string)[] }; Returns: undefined
                           },
"slugify":
{ Args: { "value": string }; Returns: string
                           },
"storage_org_id":
{ Args: { "object_name": string }; Returns: string
                           },
"tags_to_text":
{ Args: { "tags": (string)[] }; Returns: string
                           },
"task_audience":
{ Args: { "task": string }; Returns: {
              "user_id": string
            }[]
                           },
"task_creator_rank":
{ Args: { "task_id": string }; Returns: number
                           },
"task_people":
{ Args: { "task": string }; Returns: string[]
                           },
"transfer_ownership":
{ Args: { "new_owner_membership_id": string,"org_id": string }; Returns: undefined
                           },
"unclaim_task":
{ Args: { "task_id": string }; Returns: undefined
                           },
"user_can_view_channel":
{ Args: { "channel": string,"uid": string }; Returns: boolean
                           },
"user_can_view_discussion":
{ Args: { "discussion": string,"uid": string }; Returns: boolean
                           },
"user_can_view_participant":
{ Args: { "participant_id": string,"uid": string }; Returns: boolean
                           },
"user_can_view_task":
{ Args: { "task_id": string,"uid": string }; Returns: boolean
                           }
          }
          Enums: {
            "attendance_status": "present"|"late"|"absent"|"excused","chat_channel_kind": "org"|"project"|"direct","member_role": "owner"|"manager"|"admin"|"staff","notification_type": "assigned"|"claimed"|"completed"|"due_soon"|"overdue"|"invitation_accepted"|"low_attendance"|"direct_message"|"channel_message"|"mention"|"task_comment"|"task_changed"|"discussion","participant_file_action": "uploaded"|"viewed"|"downloaded"|"deleted","participant_file_kind": "waiver"|"medical"|"consent"|"id"|"other","presence_mode": "auto"|"dnd"|"invisible","project_role": "lead"|"admin"|"staff","project_status": "active"|"archived","task_assignee_kind": "claimed"|"appointed","task_completion": "any"|"all","task_kind": "general"|"appointed"|"personal","task_priority": "critical"|"high"|"medium"|"low","task_status": "todo"|"in_progress"|"done"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "attendance_status": ["present", "late", "absent", "excused"],"chat_channel_kind": ["org", "project", "direct"],"member_role": ["owner", "manager", "admin", "staff"],"notification_type": ["assigned", "claimed", "completed", "due_soon", "overdue", "invitation_accepted", "low_attendance", "direct_message", "channel_message", "mention", "task_comment", "task_changed", "discussion"],"participant_file_action": ["uploaded", "viewed", "downloaded", "deleted"],"participant_file_kind": ["waiver", "medical", "consent", "id", "other"],"presence_mode": ["auto", "dnd", "invisible"],"project_role": ["lead", "admin", "staff"],"project_status": ["active", "archived"],"task_assignee_kind": ["claimed", "appointed"],"task_completion": ["any", "all"],"task_kind": ["general", "appointed", "personal"],"task_priority": ["critical", "high", "medium", "low"],"task_status": ["todo", "in_progress", "done"]
          }
        }
} as const
