"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import {
  Controller,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

const Form = FormProvider

const FormField = Controller

interface FormItemContextValue {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  )
})
FormItem.displayName = "FormItem"

const useFormField = () => {
  const { id } = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  return {
    id,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    getFieldState,
    formState,
  }
}

const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label> & { htmlFor?: string }
>(({ className, htmlFor, ...props }, ref) => {
  const { formItemId } = useFormField()
  const { getFieldState, formState } = useFormContext()

  // Try to get error state from form
  const error = formState.errors[htmlFor || formItemId]

  return (
    <Label
      ref={ref}
      htmlFor={htmlFor || formItemId}
      className={cn(error && "text-destructive", className)}
      {...props}
    />
  )
})
FormLabel.displayName = "FormLabel"

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot> & { fieldName?: string }
>(({ ...props }, ref) => {
  const { id, formItemId, formDescriptionId, formMessageId } = useFormField()
  const { getFieldState, formState } = useFormContext()

  const fieldState = props.fieldName
    ? getFieldState(props.fieldName as any, formState)
    : { error: undefined }

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !fieldState.error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!fieldState.error}
      {...props}
    />
  )
})
FormControl.displayName = "FormControl"

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField()

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
FormDescription.displayName = "FormDescription"

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement> & { fieldName?: string }
>(({ className, ...props }, ref) => {
  const { formItemId, formMessageId } = useFormField()
  const { getFieldState, formState } = useFormContext()

  const fieldState = props.fieldName
    ? getFieldState(props.fieldName as any, formState)
    : { error: undefined }

  const body = fieldState.error ? String(fieldState.error?.message) : null

  if (!body) {
    return null
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  )
})
FormMessage.displayName = "FormMessage"

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
