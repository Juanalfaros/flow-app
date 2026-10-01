export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          node_id: string | null
          payload: Json
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          node_id?: string | null
          payload?: Json
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          node_id?: string | null
          payload?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: string
          label_id: string | null
          notify_whole_project: boolean
          project_id: string
          status_id: string | null
          target_user_id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          label_id?: string | null
          notify_whole_project?: boolean
          project_id: string
          status_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          label_id?: string | null
          notify_whole_project?: boolean
          project_id?: string
          status_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_feeds: {
        Row: {
          created_at: string
          last_accessed_at: string | null
          token: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          last_accessed_at?: string | null
          token: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          last_accessed_at?: string | null
          token?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feeds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_feeds_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: string
          mentioned_user_id: string
          seen_at: string | null
        }
        Insert: {
          comment_id: string
          mentioned_user_id: string
          seen_at?: string | null
        }
        Update: {
          comment_id?: string
          mentioned_user_id?: string
          seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          node_id: string
          parent_id: string | null
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          node_id: string
          parent_id?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          node_id?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          node_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          node_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          node_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_credentials: {
        Row: {
          connected_at: string
          google_email: string
          last_synced_at: string | null
          refresh_token_encrypted: string
          scope: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          connected_at?: string
          google_email: string
          last_synced_at?: string | null
          refresh_token_encrypted: string
          scope: string
          user_id: string
          workspace_id: string
        }
        Update: {
          connected_at?: string
          google_email?: string
          last_synced_at?: string | null
          refresh_token_encrypted?: string
          scope?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_nodes: {
        Row: {
          created_at: string
          node_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          node_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          node_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_nodes_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_nodes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          status: string
          token: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          token?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      node_access: {
        Row: {
          created_at: string
          node_id: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          created_at?: string
          node_id: string
          subject_id: string
          subject_type: string
        }
        Update: {
          created_at?: string
          node_id?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "node_access_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      node_memberships: {
        Row: {
          added_at: string
          container_id: string
          node_id: string
          position: number
        }
        Insert: {
          added_at?: string
          container_id: string
          node_id: string
          position?: number
        }
        Update: {
          added_at?: string
          container_id?: string
          node_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "node_memberships_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "node_memberships_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      nodes: {
        Row: {
          acl_boundary_id: string | null
          archived_at: string | null
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          description: string | null
          due_date: string | null
          due_reminder_sent_at: string | null
          due_time: string | null
          id: string
          is_milestone: boolean
          is_private: boolean
          parent_id: string | null
          priority: string
          space_id: string | null
          start_date: string | null
          start_time: string | null
          status_id: string | null
          title: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          acl_boundary_id?: string | null
          archived_at?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          due_date?: string | null
          due_reminder_sent_at?: string | null
          due_time?: string | null
          id?: string
          is_milestone?: boolean
          is_private?: boolean
          parent_id?: string | null
          priority?: string
          space_id?: string | null
          start_date?: string | null
          start_time?: string | null
          status_id?: string | null
          title: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          acl_boundary_id?: string | null
          archived_at?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          due_date?: string | null
          due_reminder_sent_at?: string | null
          due_time?: string | null
          id?: string
          is_milestone?: boolean
          is_private?: boolean
          parent_id?: string | null
          priority?: string
          space_id?: string | null
          start_date?: string | null
          start_time?: string | null
          status_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nodes_acl_boundary_id_fkey"
            columns: ["acl_boundary_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email: boolean
          event: string
          push: boolean
          user_id: string
        }
        Insert: {
          email?: boolean
          event: string
          push?: boolean
          user_id: string
        }
        Update: {
          email?: boolean
          event?: string
          push?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          emailed_at: string | null
          id: string
          node_id: string | null
          payload: Json
          push_quiet_hold: boolean
          pushed_at: string | null
          read_at: string | null
          recipient_id: string
          type: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          emailed_at?: string | null
          id?: string
          node_id?: string | null
          payload?: Json
          push_quiet_hold?: boolean
          pushed_at?: string | null
          read_at?: string | null
          recipient_id: string
          type: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          emailed_at?: string | null
          id?: string
          node_id?: string | null
          payload?: Json
          push_quiet_hold?: boolean
          pushed_at?: string | null
          read_at?: string | null
          recipient_id?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      presence_daily: {
        Row: {
          day: string
          first_seen_at: string | null
          last_seen_at: string | null
          minutes_online: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          day: string
          first_seen_at?: string | null
          last_seen_at?: string | null
          minutes_online?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          day?: string
          first_seen_at?: string | null
          last_seen_at?: string | null
          minutes_online?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_daily_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accent_color: string
          avatar_url: string | null
          created_at: string
          date_format: string
          default_view: string
          digest_day: number
          digest_hour: number
          email: string
          full_name: string | null
          id: string
          job_title: string | null
          last_digest_sent_at: string | null
          last_seen_at: string | null
          manager_id: string | null
          push_enabled: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: number
          quiet_hours_start: number
          quiet_weekends: boolean
          rail_style: string
          start_page: string
          theme: string
          time_format: string
          timezone: string | null
          week_starts_on: number
          weekly_digest_enabled: boolean
        }
        Insert: {
          accent_color?: string
          avatar_url?: string | null
          created_at?: string
          date_format?: string
          default_view?: string
          digest_day?: number
          digest_hour?: number
          email: string
          full_name?: string | null
          id: string
          job_title?: string | null
          last_digest_sent_at?: string | null
          last_seen_at?: string | null
          manager_id?: string | null
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: number
          quiet_hours_start?: number
          quiet_weekends?: boolean
          rail_style?: string
          start_page?: string
          theme?: string
          time_format?: string
          timezone?: string | null
          week_starts_on?: number
          weekly_digest_enabled?: boolean
        }
        Update: {
          accent_color?: string
          avatar_url?: string | null
          created_at?: string
          date_format?: string
          default_view?: string
          digest_day?: number
          digest_hour?: number
          email?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          last_digest_sent_at?: string | null
          last_seen_at?: string | null
          manager_id?: string | null
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: number
          quiet_hours_start?: number
          quiet_weekends?: boolean
          rail_style?: string
          start_page?: string
          theme?: string
          time_format?: string
          timezone?: string | null
          week_starts_on?: number
          weekly_digest_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_custom_fields: {
        Row: {
          created_at: string
          field_type: string
          id: string
          name: string
          options: Json | null
          position: number
          project_id: string
        }
        Insert: {
          created_at?: string
          field_type: string
          id?: string
          name: string
          options?: Json | null
          position?: number
          project_id: string
        }
        Update: {
          created_at?: string
          field_type?: string
          id?: string
          name?: string
          options?: Json | null
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_custom_fields_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_custom_fields: {
        Row: {
          field_type: string
          name: string
          options: Json | null
          position: number
          template_id: string
        }
        Insert: {
          field_type: string
          name: string
          options?: Json | null
          position: number
          template_id: string
        }
        Update: {
          field_type?: string
          name?: string
          options?: Json | null
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_custom_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_statuses: {
        Row: {
          is_default: boolean
          name: string
          position: number
          status_kind: string
          template_id: string
        }
        Insert: {
          is_default?: boolean
          name: string
          position: number
          status_kind: string
          template_id: string
        }
        Update: {
          is_default?: boolean
          name?: string
          position?: number
          status_kind?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_statuses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_tasks: {
        Row: {
          position: number
          status_position: number
          task_template_id: string
          template_id: string
        }
        Insert: {
          position: number
          status_position: number
          task_template_id: string
          template_id: string
        }
        Update: {
          position?: number
          status_position?: number
          task_template_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_tasks_task_template_id_fkey"
            columns: ["task_template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      public_links: {
        Row: {
          created_at: string
          created_by: string
          last_accessed_at: string | null
          node_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          last_accessed_at?: string | null
          node_id: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          last_accessed_at?: string | null
          node_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_links_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: true
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recent_views: {
        Row: {
          node_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          node_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          node_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recent_views_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      statuses: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          position: number
          project_id: string
          status_kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
          project_id: string
          status_kind?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          project_id?: string
          status_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "statuses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_by: string | null
          created_at: string
          node_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          node_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          node_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          filename: string
          id: string
          node_id: string
          size_bytes: number
          storage_key: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          filename: string
          id?: string
          node_id: string
          size_bytes: number
          storage_key: string
          uploaded_by: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          filename?: string
          id?: string
          node_id?: string
          size_bytes?: number
          storage_key?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_custom_field_values: {
        Row: {
          field_id: string
          node_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          field_id: string
          node_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          field_id?: string
          node_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "task_custom_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "project_custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_custom_field_values_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          id: string
          predecessor_id: string
          successor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          predecessor_id: string
          successor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          predecessor_id?: string
          successor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_labels: {
        Row: {
          label_id: string
          node_id: string
        }
        Insert: {
          label_id: string
          node_id: string
        }
        Update: {
          label_id?: string
          node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_labels_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recurrences: {
        Row: {
          created_at: string
          days_of_week: number[] | null
          ends_on: string | null
          frequency: string
          id: string
          interval: number
          node_id: string
          occurrences_left: number | null
        }
        Insert: {
          created_at?: string
          days_of_week?: number[] | null
          ends_on?: string | null
          frequency: string
          id?: string
          interval?: number
          node_id: string
          occurrences_left?: number | null
        }
        Update: {
          created_at?: string
          days_of_week?: number[] | null
          ends_on?: string | null
          frequency?: string
          id?: string
          interval?: number
          node_id?: string
          occurrences_left?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_recurrences_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: true
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reviewers: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          node_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          node_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          node_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_reviewers_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_reviewers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          label_ids: string[]
          name: string
          priority: string
          subtasks: Json
          title: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          label_ids?: string[]
          name: string
          priority?: string
          subtasks?: Json
          title: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          label_ids?: string[]
          name?: string
          priority?: string
          subtasks?: Json
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_watchers: {
        Row: {
          created_at: string
          node_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          node_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          node_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_watchers_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_watchers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          added_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          team_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          handle: string
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          handle: string
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          handle?: string
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          minutes: number
          node_id: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_date?: string
          id?: string
          minutes: number
          node_id: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          minutes?: number
          node_id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          kind: string
          note: string | null
          starts_on: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          kind?: string
          note?: string | null
          starts_on: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          kind?: string
          note?: string | null
          starts_on?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          login_background_url: string | null
          logo_url: string | null
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          login_background_url?: string | null
          logo_url?: string | null
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          login_background_url?: string | null
          logo_url?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_pending_invitations: { Args: never; Returns: undefined }
      admin_update_profile: {
        Args: {
          p_avatar_url: string
          p_full_name: string
          p_job_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      archive_node: { Args: { p_node_id: string }; Returns: undefined }
      assert_admin_of: { Args: { p_workspace_id: string }; Returns: undefined }
      assert_can_access_node: {
        Args: { p_node_id: string }
        Returns: undefined
      }
      assert_member_of: { Args: { p_workspace_id: string }; Returns: undefined }
      calendar_feed_events: {
        Args: { p_token: string }
        Returns: {
          changed_at: string
          due_time: string
          ends_on: string
          kind: string
          starts_on: string
          title: string
          uid: string
        }[]
      }
      can_access_node: { Args: { p_node_id: string }; Returns: boolean }
      can_access_node_row: {
        Args: {
          p_acl_boundary_id: string
          p_space_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      can_access_personal_node: {
        Args: {
          p_assignee_id: string
          p_created_by: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      can_access_space: { Args: { p_space_id: string }; Returns: boolean }
      can_user_access_node: {
        Args: { p_node_id: string; p_user_id: string }
        Returns: boolean
      }
      create_project_with_defaults: {
        Args: { p_name: string; p_parent_id: string }
        Returns: string
      }
      create_task_node: {
        Args: {
          p_assignee_id?: string
          p_container_id: string
          p_due_date?: string
          p_due_time?: string
          p_id: string
          p_is_milestone?: boolean
          p_parent_id?: string
          p_position: number
          p_priority?: string
          p_start_date?: string
          p_start_time?: string
          p_status_id: string
          p_title: string
        }
        Returns: string
      }
      create_workspace_with_defaults: {
        Args: { p_name: string }
        Returns: {
          project_id: string
          workspace_id: string
        }[]
      }
      decide_task_review: {
        Args: { p_approved: boolean; p_node_id: string }
        Returns: undefined
      }
      delete_folder_with_contents: {
        Args: { p_folder_id: string }
        Returns: undefined
      }
      delete_project_with_tasks: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      duplicate_space: {
        Args: { p_new_name: string; p_space_id: string }
        Returns: string
      }
      duplicate_task_node: {
        Args: {
          p_container_id: string
          p_position: number
          p_source_id: string
          p_status_id: string
        }
        Returns: string
      }
      get_login_branding: {
        Args: never
        Returns: {
          login_background_url: string
          logo_url: string
        }[]
      }
      get_or_create_calendar_feed: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      get_or_create_public_link: {
        Args: { p_node_id: string }
        Returns: string
      }
      get_report_data: {
        Args: {
          p_include_subtasks?: boolean
          p_period?: string
          p_space_id?: string
          p_team_id?: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      has_node_access_grant: {
        Args: { p_node_id: string; p_user_id: string }
        Returns: boolean
      }
      has_unapproved_reviewers: {
        Args: { p_node_id: string }
        Returns: boolean
      }
      has_unmet_dependencies: { Args: { p_node_id: string }; Returns: boolean }
      import_tasks: {
        Args: { p_container_id: string; p_rows: Json }
        Returns: string[]
      }
      instantiate_project_template: {
        Args: { p_name: string; p_space_id: string; p_template_id: string }
        Returns: string
      }
      instantiate_task_template: {
        Args: {
          p_container_id: string
          p_position: number
          p_status_id: string
          p_template_id: string
        }
        Returns: string
      }
      invite_member: {
        Args: { p_email: string; p_role: string; p_workspace_id: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          status: string
          token: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin_of: { Args: { p_workspace_id: string }; Returns: boolean }
      is_member_of: { Args: { p_workspace_id: string }; Returns: boolean }
      is_signup_open: { Args: never; Returns: boolean }
      manager_would_create_cycle: {
        Args: { p_manager_id: string; p_user_id: string }
        Returns: boolean
      }
      member_role: { Args: { p_workspace_id: string }; Returns: string }
      move_project_tasks: {
        Args: {
          p_from_project_id: string
          p_to_project_id: string
          p_to_status_id: string
        }
        Returns: undefined
      }
      move_task_node: {
        Args: {
          p_container_id: string
          p_node_id: string
          p_position: number
          p_status_id: string
        }
        Returns: undefined
      }
      new_calendar_feed_token: { Args: never; Returns: string }
      promote_subtask_to_task: {
        Args: { p_container_id: string; p_node_id: string }
        Returns: undefined
      }
      public_link_view: { Args: { p_token: string }; Returns: Json }
      rebalance_positions: {
        Args: { p_container_id: string }
        Returns: undefined
      }
      regenerate_calendar_feed: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      regenerate_public_link: { Args: { p_node_id: string }; Returns: string }
      remove_member: { Args: { p_user_id: string }; Returns: undefined }
      revoke_public_link: { Args: { p_node_id: string }; Returns: undefined }
      save_project_as_template: {
        Args: { p_name: string; p_project_id: string }
        Returns: string
      }
      save_task_as_template: {
        Args: { p_name: string; p_task_id: string }
        Returns: string
      }
      set_manager: {
        Args: { p_manager_id: string; p_user_id: string }
        Returns: undefined
      }
      touch_presence: {
        Args: { p_interval_minutes?: number; p_workspace_id: string }
        Returns: undefined
      }
      try_uuid: { Args: { p_text: string }; Returns: string }
      unarchive_node: { Args: { p_node_id: string }; Returns: undefined }
      update_member_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      validate_custom_field_value: {
        Args: { p_field_id: string; p_value: Json }
        Returns: boolean
      }
      would_create_cycle: {
        Args: { p_predecessor_id: string; p_successor_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
