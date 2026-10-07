
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
                },"documents": {
                  Row: {
                    "created_at": string,"id": string,"mime_type": string,"name": string,"organization_id": string,"pinned": boolean,"project_id": string | null,"search": unknown,"size_bytes": number,"storage_path": string,"tags": (string)[],"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"mime_type": string,"name": string,"organization_id": string,"pinned"?: boolean,"project_id"?: string | null,"search"?: never,"size_bytes": number,"storage_path": string,"tags"?: (string)[],"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"mime_type"?: string,"name"?: string,"organization_id"?: string,"pinned"?: boolean,"project_id"?: string | null,"search"?: never,"size_bytes"?: number,"storage_path"?: string,"tags"?: (string)[],"uploaded_by"?: string | null
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
                    "all_day": boolean,"created_at": string,"created_by": string | null,"description": string | null,"ends_at": string,"id": string,"location": string | null,"organization_id": string,"project_id": string | null,"starts_at": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_at": string,"id"?: string,"location"?: string | null,"organization_id": string,"project_id"?: string | null,"starts_at": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "all_day"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"ends_at"?: string,"id"?: string,"location"?: string | null,"organization_id"?: string,"project_id"?: string | null,"starts_at"?: string,"title"?: string,"updated_at"?: string
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
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"organization_id": string,"role": Database["public"]['Enums']["member_role"],"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id": string,"role"?: Database["public"]['Enums']["member_role"],"token"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id"?: string,"role"?: Database["public"]['Enums']["member_role"],"token"?: string
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
                    "created_at": string,"id": string,"organization_id": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"role"?: Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
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
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"preset_key": string,"slug": string,"terminology_overrides": NonNullable<Json>,"theme": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"preset_key"?: string,"slug": string,"terminology_overrides"?: NonNullable<Json>,"theme"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"preset_key"?: string,"slug"?: string,"terminology_overrides"?: NonNullable<Json>,"theme"?: NonNullable<Json>
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
                    "created_at": string,"email": string,"full_name": string | null,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"projects": {
                  Row: {
                    "color": string | null,"created_at": string,"created_by": string | null,"description": string | null,"end_date": string | null,"id": string,"name": string,"organization_id": string,"owner_membership_id": string | null,"start_date": string | null,"status": Database["public"]['Enums']["project_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"end_date"?: string | null,"id"?: string,"name": string,"organization_id": string,"owner_membership_id"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"end_date"?: string | null,"id"?: string,"name"?: string,"organization_id"?: string,"owner_membership_id"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string
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
                },"tasks": {
                  Row: {
                    "assignee_membership_id": string | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"description": string | null,"due_date": string | null,"id": string,"organization_id": string,"position": number,"project_id": string,"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_membership_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"organization_id": string,"position"?: number,"project_id": string,"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "assignee_membership_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"organization_id"?: string,"position"?: number,"project_id"?: string,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assignee_membership_id_organization_id_fkey"
      columns: ["assignee_membership_id","organization_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","organization_id"]
    },{
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
"create_organization":
{ Args: { "name": string,"preset_key": string }; Returns: {
              "created_at": string,
"id": string,
"name": string,
"preset_key": string,
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
"get_invitation":
{ Args: { "token": string }; Returns: {
              "accepted_at": string,"email": string,"expires_at": string,"organization_name": string,"organization_slug": string,"role": Database["public"]['Enums']["member_role"]
            }[]
                           },
"has_role":
{ Args: { "org_id": string,"required": Database["public"]['Enums']["member_role"] }; Returns: boolean
                           },
"is_member":
{ Args: { "org_id": string }; Returns: boolean
                           },
"my_membership_id":
{ Args: { "org_id": string }; Returns: string
                           },
"recent_projects":
{ Args: { "max_rows"?: number,"org_id": string }; Returns: {
              "color": string,"id": string,"last_activity_at": string,"name": string
            }[]
                           },
"shares_org":
{ Args: { "other_user": string }; Returns: boolean
                           },
"slugify":
{ Args: { "value": string }; Returns: string
                           },
"storage_org_id":
{ Args: { "object_name": string }; Returns: string
                           },
"tags_to_text":
{ Args: { "tags": (string)[] }; Returns: string
                           }
          }
          Enums: {
            "member_role": "admin"|"member","project_status": "active"|"archived","task_status": "todo"|"in_progress"|"done"
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
            "member_role": ["admin", "member"],"project_status": ["active", "archived"],"task_status": ["todo", "in_progress", "done"]
          }
        }
} as const
