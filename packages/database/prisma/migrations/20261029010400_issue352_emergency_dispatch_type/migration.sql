-- Issue #352: commit the enum addition separately before any CHECK uses it.
ALTER TYPE public.dispatch_event_type ADD VALUE 'EMERGENCY_TAKEOVER';
