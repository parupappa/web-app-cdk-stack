import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2"; // Allows working with EC2 and VPC resources
import * as iam from "@aws-cdk/aws-iam"; // Allows working with IAM resources

export class Ec2CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // set instance profile to use ssm
    const instanceProfile = new iam.Role(this, "ec2_profile", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "for instance profile",
      managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });

    // VPC
    const vpc = new ec2.Vpc(this, "Web-VPC", {
      cidr: "10.0.0.0/16",
    });

    // Create a key pair to be used with this EC2 Instance
    const key = new ec2.CfnKeyPair(this, "CfnKeyPair", {
      keyName: 'ec2-key-pair',
    });
    // Delete the key pair when the stack is deleted
    key.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    // キーペア取得コマンドアウトプット
    new cdk.CfnOutput(this, 'GetSSHKeyCommand', {
      value: `aws ssm get-parameter --name /ec2/keypair/${key.getAtt('KeyPairId')} --region ${this.region} --with-decryption --query Parameter.Value --output text`,
    })
    

    // Security group for the EC2 instance
    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      description: "Allow SSH (TCP port 22) and HTTP (TCP port 80) in",
      allowAllOutbound: true,
    });

    // Allow SSH access on port tcp/22
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "Allow SSH Access");
    // Allow HTTP access on port tcp/80
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow HTTP Access");

    // IAM role to allow access to other AWS services
    const role = new iam.Role(this, "ec2Role", { assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"), });
    // IAM policy attachment to allow access to 
    role.addManagedPolicy( iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));

    // Look up the AMI Id for the Amazon Linux 2 Image with CPU Type X86_64
    const ami = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.X86_64,
    });

    // Create the EC2 instance using the Security Group, AMI, and KeyPair defined.
    const ec2Instance = new ec2.Instance(this, "Instance", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ami,
      securityGroup: securityGroup,
      keyName: key.keyName,
      role: role,
    });
  }
}